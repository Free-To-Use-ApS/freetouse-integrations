import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

// Anonymous, STATELESS OAuth 2.1 provider.
//
// Claude's custom connectors require an OAuth handshake, so we implement the
// full flow (discovery, dynamic client registration, authorize, token, refresh)
// — but there is no user login: anyone who connects is approved. The catalog is
// public, so there's nothing to protect beyond hosting abuse (handled by rate
// limiting). What makes this production-grade rather than a spike: every
// artifact (client_id, authorization code, access + refresh tokens) is a SIGNED
// JWT, so NO server-side session state is kept. Tokens survive restarts and the
// server scales horizontally as long as all instances share AUTH_SECRET.

const ACCESS_TTL = 60 * 60; // 1h
const REFRESH_TTL = 30 * 24 * 60 * 60; // 30d
const CODE_TTL = 10 * 60; // 10m

// Signing secret. Set AUTH_SECRET in production (and share it across instances);
// otherwise we generate an ephemeral one — fine for a single dev instance, but
// every restart invalidates existing tokens.
const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  (() => {
    console.warn(
      "[auth] AUTH_SECRET not set — using an ephemeral secret. Set AUTH_SECRET in production so tokens survive restarts and work across instances.",
    );
    return randomBytes(32).toString("hex");
  })();

// --- minimal HS256 JWT (no extra dependency) -------------------------------

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj)));
}
function sign(data: string): string {
  return b64url(createHmac("sha256", AUTH_SECRET).update(data).digest());
}

interface JwtPayload {
  typ: string;
  iat: number;
  exp?: number;
  [key: string]: unknown;
}

function signJwt(payload: Record<string, unknown>, ttlSec?: number): string {
  const iat = Math.floor(Date.now() / 1000);
  const body: JwtPayload = { ...payload, iat, ...(ttlSec ? { exp: iat + ttlSec } : {}) } as JwtPayload;
  const head = b64urlJson({ alg: "HS256", typ: "JWT" });
  const data = `${head}.${b64urlJson(body)}`;
  return `${data}.${sign(data)}`;
}

function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(data));
  const got = Buffer.from(parts[2]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// --- stateless client store -------------------------------------------------
// The client_id we hand back IS a signed token encoding the registration, so we
// can reconstruct the client on later requests without storing anything.

class StatelessClients implements OAuthRegisteredClientsStore {
  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    const client_id = signJwt({
      typ: "client",
      redirect_uris: client.redirect_uris,
      auth: client.token_endpoint_auth_method ?? "none",
    });
    return {
      ...client,
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    } as OAuthClientInformationFull;
  }

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const p = verifyJwt(clientId);
    if (!p || p.typ !== "client") return undefined;
    return {
      client_id: clientId,
      redirect_uris: (p.redirect_uris as string[]) ?? [],
      token_endpoint_auth_method: (p.auth as string) ?? "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    } as OAuthClientInformationFull;
  }
}

function tokens(clientId: string, scopes: string[], resource?: string): OAuthTokens {
  const access = signJwt({ typ: "access", cid: clientId, sc: scopes, rs: resource }, ACCESS_TTL);
  const refresh = signJwt({ typ: "refresh", cid: clientId, sc: scopes, rs: resource }, REFRESH_TTL);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: refresh,
    scope: scopes.join(" "),
  };
}

export class AnonymousJwtOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new StatelessClients();

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // No login screen — issue a code immediately (anonymous).
    const code = signJwt(
      {
        typ: "code",
        cid: client.client_id,
        cc: params.codeChallenge,
        ru: params.redirectUri,
        sc: params.scopes ?? [],
        rs: params.resource?.href,
      },
      CODE_TTL,
    );
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set("code", code);
    if (params.state) redirect.searchParams.set("state", params.state);
    res.redirect(302, redirect.href);
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const p = verifyJwt(authorizationCode);
    if (!p || p.typ !== "code") throw new Error("invalid authorization code");
    return (p.cc as string) ?? "";
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const p = verifyJwt(authorizationCode);
    if (!p || p.typ !== "code") throw new Error("invalid authorization code");
    return tokens(p.cid as string, (p.sc as string[]) ?? [], resource?.href ?? (p.rs as string));
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const p = verifyJwt(refreshToken);
    if (!p || p.typ !== "refresh") throw new Error("invalid refresh token");
    return tokens(
      p.cid as string,
      scopes ?? (p.sc as string[]) ?? [],
      resource?.href ?? (p.rs as string),
    );
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const p = verifyJwt(token);
    // Throw the SDK's InvalidTokenError so the middleware returns 401 (with a
    // WWW-Authenticate challenge) — hosts rely on 401 to refresh/re-auth.
    if (!p || p.typ !== "access") throw new InvalidTokenError("Invalid or expired token");
    return {
      token,
      clientId: p.cid as string,
      scopes: (p.sc as string[]) ?? [],
      expiresAt: p.exp,
      resource: p.rs ? new URL(p.rs as string) : undefined,
    };
  }
}
