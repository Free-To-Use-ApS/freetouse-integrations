import express, { type Request, type Response, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  searchMusic,
  warmUp,
  formatDuration,
  DEFAULT_RESULTS,
  MAX_RESULTS,
  type UiTrack,
} from "./ftu.js";
import { buildWidgetHtml } from "./widget.js";
import { AnonymousJwtOAuthProvider } from "./auth.js";

const WIDGET_HTML = buildWidgetHtml();
// Version the resource URI by a content hash. Hosts (e.g. ChatGPT) cache the
// widget template by its URI, so a stable URI means a stale widget after an
// update. Hashing the HTML makes the URI change automatically whenever the
// widget actually changes, while unchanged deploys keep the same URI (cache hit).
const WIDGET_VERSION = createHash("sha256").update(WIDGET_HTML).digest("hex").slice(0, 8);
const WIDGET_URI = `ui://widget/results-${WIDGET_VERSION}.html`;

// UI metadata: CSP (standard + ChatGPT mirror) so cover art, audio (media-src),
// and the Nunito font load under strict CSP, and ChatGPT recognizes the policy.
const WIDGET_META = {
  ui: {
    // resourceDomains maps to img-src/script-src/style-src/font-src/media-src.
    csp: {
      resourceDomains: [
        "https://data.freetouse.com",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
      ],
      connectDomains: ["https://data.freetouse.com"],
    },
  },
  "openai/widgetCSP": {
    connect_domains: ["https://data.freetouse.com"],
    resource_domains: [
      "https://data.freetouse.com",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ],
  },
};

function widgetContents(uri: string) {
  return {
    contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: WIDGET_HTML, _meta: WIDGET_META }],
  };
}

// Model-facing text: a compact numbered list. Hosts without UI show this; it
// always includes the listen/download link, a few tags, and a short blurb.
function formatResults(query: string, tracks: UiTrack[]): string {
  if (tracks.length === 0) {
    return `No Free To Use tracks found${query ? ` for "${query}"` : ""}. Try a mood, genre, or activity like "calm piano", "upbeat workout", or "lofi study".`;
  }
  const header = query
    ? `Found ${tracks.length} Free To Use track${tracks.length > 1 ? "s" : ""} for "${query}":`
    : `Here ${tracks.length > 1 ? "are" : "is"} ${tracks.length} Free To Use track${tracks.length > 1 ? "s" : ""}:`;
  const body = tracks
    .map((t, i) => {
      const meta = [t.artist, t.genre, formatDuration(t.duration)].filter(Boolean).join(" · ");
      const tagLine = t.tags.length ? `\n   Tags: ${t.tags.join(", ")}` : "";
      return `${i + 1}. **${t.title}** — ${meta}\n   ${t.description}${tagLine}\n   [Listen & download](${t.url})`;
    })
    .join("\n\n");
  return `${header}\n\n${body}`;
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "freetouse-music", version: "0.1.0" });

  // The results widget, served as an MCP Apps UI resource at the current
  // content-hashed URI (listed + normalized for hosts).
  registerAppResource(
    server,
    "Free To Use Results",
    WIDGET_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Inline list of Free To Use tracks with an audio player",
    },
    async () => widgetContents(WIDGET_URI),
  );

  // Catch-all: serve the CURRENT widget for ANY ui://widget/* URI. Hosts cache
  // the tool definition (with its hashed widget URI); after we ship a new widget
  // the hash changes, but a host still holding the previous URI would otherwise
  // get a 404 ("Failed to fetch template"). This template resolves any past or
  // future hash to the current widget, so stale caches degrade gracefully.
  server.registerResource(
    "Free To Use Results (versioned)",
    new ResourceTemplate("ui://widget/{file}", { list: undefined }),
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Versioned Free To Use results widget",
    },
    async (uri) => widgetContents(uri.href),
  );

  // One search tool, graceful degradation:
  //  - `content` is a compact numbered list with listen/download links, tags,
  //    and a short description — what hosts WITHOUT UI show (e.g. Claude today).
  //  - `_meta.ui.resourceUri` + `structuredContent` bind the results widget —
  //    what hosts WITH UI render instead (e.g. ChatGPT). Same tool, both paths.
  registerAppTool(
    server,
    "search_music",
    {
      title: "Search Free To Use music",
      description:
        "Find royalty-free Free To Use music tracks by mood, genre, activity, or vibe " +
        '(e.g. "calm piano for studying", "energetic workout", "cinematic trailer", "lofi"). ' +
        "Returns tracks with tags, a short description, and a listen/download link. " +
        "Use whenever the user wants background music for videos, streams, podcasts, or other content.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        query: z
          .string()
          .describe(
            'What kind of music to find: a mood, genre, activity, or vibe. E.g. "upbeat corporate", "sad piano", "lofi study". Leave empty for staff-picked popular tracks.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .optional()
          .describe(`How many tracks to return (1-${MAX_RESULTS}, default ${DEFAULT_RESULTS}).`),
      },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async ({ query, limit }) => {
      const q = query ?? "";
      const tracks = await searchMusic(q, limit ?? DEFAULT_RESULTS);
      return {
        content: [{ type: "text", text: formatResults(q, tracks) }],
        structuredContent: { query: q, tracks },
      };
    },
  );

  return server;
}

// Stateful Streamable HTTP transport (the pattern remote connectors expect):
// one transport per session, keyed by the mcp-session-id header.
const transports: Record<string, StreamableHTTPServerTransport> = {};

const app = express();
// Behind one proxy/tunnel/load balancer, so rate limiting keys on the real
// client IP from X-Forwarded-For rather than the proxy's.
app.set("trust proxy", 1);
app.use(express.json());

// Abuse protection for the public MCP endpoint (the OAuth endpoints are already
// rate-limited by the SDK). Generous enough for normal interactive use.
const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;
app.use("/mcp", mcpLimiter);

// --- OAuth (anonymous, stateless JWT) ---------------------------------------
// Claude custom connectors require an OAuth 2.1 handshake before they connect.
// This provider approves everyone (no login) but issues signed-JWT tokens, so
// it keeps no session state and survives restarts. Set AUTH_SECRET in prod.
// PUBLIC_URL must be the address clients reach the server at (the tunnel/host
// URL), because the OAuth discovery documents advertise absolute URLs. On Render
// this is auto-injected as RENDER_EXTERNAL_URL, so no manual config is needed.
const PUBLIC_URL = (
  process.env.PUBLIC_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");

const oauth = new AnonymousJwtOAuthProvider();

app.use(
  mcpAuthRouter({
    provider: oauth,
    issuerUrl: new URL(PUBLIC_URL),
    resourceServerUrl: new URL(`${PUBLIC_URL}/mcp`),
    resourceName: "Free To Use Music",
  }) as unknown as RequestHandler,
);

// The SDK is typed against its own copy of @types/express, so its RequestHandler
// differs from this app's. Cast to bridge the duplicate type defs — the runtime
// middleware is identical.
const requireAuth = requireBearerAuth({
  verifier: oauth,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(`${PUBLIC_URL}/mcp`)),
}) as unknown as RequestHandler;

app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    await buildServer().connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

async function handleSession(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
}

app.get("/mcp", requireAuth, handleSession);
app.delete("/mcp", requireAuth, handleSession);

// Health check for uptime monitors / load balancers.
app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Convenience route: serve the widget standalone so it can be sanity-checked in
// a normal browser, outside any host sandbox/CSP.
app.get("/preview", (_req: Request, res: Response) => {
  res.type("html").send(WIDGET_HTML);
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Free To Use Music MCP server listening on http://localhost:${PORT}/mcp`);
  // Pre-load the catalog index so the first search is instant.
  warmUp()
    .then((count) => console.log(`Catalog index ready: ${count} tracks.`))
    .catch((e) => console.warn("Catalog index warm-up failed (will retry on first search):", e?.message ?? e));
});
