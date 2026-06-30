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
  browseArtist,
  browseCategory,
  findSimilar,
  resolveTrackRef,
  listCategories,
  hasUsableTerms,
  warmUp,
  formatDuration,
  DEFAULT_RESULTS,
  MAX_RESULTS,
  type TrackPage,
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
    // resourceDomains -> img-src/style-src/font-src/media-src. data.freetouse.com
    // serves cover art + audio; "data:" allows the embedded base64 Nunito font.
    csp: {
      resourceDomains: ["https://data.freetouse.com", "data:"],
      connectDomains: ["https://data.freetouse.com"],
    },
  },
  // ChatGPT-specific: declaring widgetCSP + widgetDomain is what ChatGPT reads to
  // recognize the policy (the "CSP off" dev-mode badge). For an inline-served
  // widget the domain is chatgpt.com (per OpenAI's Apps SDK guidance).
  "openai/widgetCSP": {
    connect_domains: ["https://data.freetouse.com"],
    resource_domains: ["https://data.freetouse.com", "data:"],
  },
  "openai/widgetDomain": "https://chatgpt.com",
};

function widgetContents(uri: string) {
  return {
    contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: WIDGET_HTML, _meta: WIDGET_META }],
  };
}

const FRIENDLY_ERROR =
  "Sorry — Free To Use is temporarily unavailable. Please try again in a moment.";

// Connector-level guidance the host shows the model (MCP `initialize` instructions).
// Two goals: (1) interview briefly to narrow broad requests before searching, and
// (2) always answer by calling a tool and showing the players — never refuse or
// invent a catalog size.
const SERVER_INSTRUCTIONS = [
  "Free To Use is a public, royalty-free music catalog. These tools return tracks",
  "as interactive players (cover, waveform, play, download) — the players ARE the",
  "answer; show them rather than describing tracks in prose.",
  "",
  "NARROW BEFORE SEARCHING — DO NOT GUESS THE MOOD. When a request is open-ended or a",
  'use-case ("music for a drone video", "a wedding", "a podcast intro", "my vlog") or a',
  'bare genre/mood ("lofi", "something chill", "upbeat"), STOP and ask the user 1-2 short',
  "questions about the vibe. OFFER a few example directions to give them a starting point but",
  'keep it OPEN — don\'t force a choice from a fixed list. e.g. "Should it feel upbeat and',
  'energetic, calm and emotional, cinematic and epic — or something different? Describe the',
  'vibe in your own words." Then WAIT for their reply. Never invent a mood and search anyway.',
  "Once they answer (or say to just pick, or the request",
  "is already specific), call search_music ONCE with a concise query in THEIR words (a few",
  'distinct terms like "calm cinematic", never a long padded phrase). browse_category lists',
  "a whole genre/mood; browse_artist lists an artist's catalog; find_similar finds more",
  "like a given track.",
  "",
  "When you present tracks, briefly remind the user of the usage policy — Free To Use music is",
  "free to use with attribution, and monetized/commercial use (or skipping attribution) may need",
  "a license — and include the link: https://freetouse.com/usage-policy",
  "",
  "NEVER refuse to show tracks or say there are 'too many to display' — show the",
  "first page (results include a total and a Load more control). NEVER invent or",
  "estimate how many tracks exist; only state a count a tool actually returned.",
].join("\n");

// Shared, reusable arg schemas for the track tools.
const limitArg = z
  .number()
  .int()
  .min(1)
  .max(MAX_RESULTS)
  .optional()
  .describe(`How many tracks to return (1-${MAX_RESULTS}, default ${DEFAULT_RESULTS}).`);
const offsetArg = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe("Skip this many results — for paging to the next page (the widget's Load more uses this).");
// Sort orders mirror the freetouse.com dropdown. search_music also offers
// "relevance" (best keyword match) and defaults to it; browse defaults differ.
const searchSortArg = z
  .enum(["relevance", "staff", "popular", "newest", "undiscovered"])
  .optional()
  .describe(
    'Result order: "relevance" (best match — the default, leave unset), "staff" (curated), ' +
      '"popular" (most downloads), "newest", "undiscovered" (fewest plays). The user can also ' +
      "change this from the widget's sort dropdown.",
  );
const browseSortArg = z
  .enum(["staff", "popular", "newest", "undiscovered"])
  .optional()
  .describe(
    'Result order: "staff" (curated), "popular" (most downloads), "newest", "undiscovered" ' +
      "(fewest plays). Leave unset for the default. The widget also exposes this as a dropdown.",
  );

interface MoreRef {
  tool: string;
  args: Record<string, unknown>;
}

function errorResult() {
  return { content: [{ type: "text" as const, text: FRIENDLY_ERROR }] };
}

// Model-facing text for a page of tracks (also the fallback for hosts without a
// widget). Flags premium tracks and reminds the model how to attribute.
function formatPage(heading: string, page: TrackPage): string {
  const { tracks, offset, total, limit } = page;
  if (tracks.length === 0) {
    return `${heading}\n\nNo tracks found. Try another mood, genre, artist, or category — e.g. "calm piano", "Pufino", or use list_categories.`;
  }
  const body = tracks
    .map((t, i) => {
      const meta = [t.artist, t.genre, formatDuration(t.duration)].filter(Boolean).join(" · ");
      const premium = t.premium
        ? "\n   ⚠️ Premium — tell the user this track needs an active subscription or a single-track license."
        : "";
      return `${offset + i + 1}. **${t.title}** — ${meta}\n   ${t.description}${premium}\n   [Listen & download](${t.url})`;
    })
    .join("\n\n");
  const shown = offset + tracks.length;
  const more =
    shown < total
      ? `\n\nShowing ${offset + 1}-${shown} of ${total}. Call the same tool with offset ${shown} for the next ${Math.min(limit, total - shown)}.`
      : "";
  const policy =
    "\n\n**Using these tracks:** Free To Use music is free to use as long as you credit the track in " +
    'your video description — "Music track: <title> by <artist>, Source: https://freetouse.com/music". ' +
    "Monetized or commercial use, or using a track without attribution, may require a subscription or a " +
    "single-track license. Remind the user to review the full usage policy: " +
    "https://freetouse.com/usage-policy";
  return `${heading}\n\n${body}${more}${policy}`;
}

// Encode the 0-100 waveform bars as a compact base64 string instead of an array
// of ~80 integers. ChatGPT injects structuredContent into the MODEL's context, so
// the raw array is pure token bloat there; the widget decodes the string back.
function encodePeaks(peaks: number[] | undefined): string {
  if (!peaks || peaks.length === 0) return "";
  return Buffer.from(peaks.map((v) => Math.max(0, Math.min(100, Math.round(v))))).toString("base64");
}

// Widget-facing track shape. The model already has everything it needs from the
// text channel (formatPage), so we drop fields the widget never reads
// (genre/description/attribution/tags) and compact the peaks, keeping the
// structuredContent the model sees small.
function toWireTrack(t: UiTrack) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    mp3: t.mp3,
    art: t.art,
    url: t.url,
    artistUrl: t.artistUrl,
    gain: t.gain,
    chips: t.chips,
    premium: t.premium,
    peaks: encodePeaks(t.peaks),
  };
}

// Dual-channel tool result: model-facing text + widget structuredContent.
function pageResult(heading: string, page: TrackPage, more: MoreRef) {
  return {
    content: [{ type: "text" as const, text: formatPage(heading, page) }],
    structuredContent: {
      heading,
      tracks: page.tracks.map(toWireTrack),
      offset: page.offset,
      limit: page.limit,
      total: page.total,
      // The applied ordering, so the widget's sort dropdown reflects it (null = no
      // dropdown, e.g. find_similar).
      sort: page.sort ?? null,
      // Always present — the widget re-uses it for BOTH "Load more" (with an offset)
      // and the sort dropdown (re-fetch with a new sort). The Load more button hides
      // itself once everything is shown.
      more,
    },
  };
}

// Wraps a track-tool handler with structured logging + graceful error handling.
async function run(
  tool: string,
  logArgs: Record<string, unknown>,
  produce: () => Promise<{ heading: string; page: TrackPage; more: MoreRef }>,
) {
  const start = Date.now();
  try {
    const { heading, page, more } = await produce();
    console.log(
      JSON.stringify({
        evt: "tool",
        tool,
        ...logArgs,
        ms: Date.now() - start,
        results: page.tracks.length,
        total: page.total,
      }),
    );
    return pageResult(heading, page, more);
  } catch (e) {
    console.warn(
      JSON.stringify({
        evt: "tool_error",
        tool,
        ...logArgs,
        ms: Date.now() - start,
        error: String((e as Error)?.message ?? e),
      }),
    );
    return errorResult();
  }
}

const plural = (n: number, s = "s") => (n === 1 ? "" : s);

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "freetouse-music", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

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

  // All track tools share: read-only + open-world annotations, and they bind the
  // results widget so hosts with UI render the players while hosts without UI
  // fall back to the model-facing text from formatPage().
  const trackAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
  const widgetMeta = { ui: { resourceUri: WIDGET_URI } };

  // search_music — the primary entry point.
  registerAppTool(
    server,
    "search_music",
    {
      title: "Search Free To Use music",
      description:
        "Search Free To Use's royalty-free catalog and show the user interactive players " +
        "(cover, waveform, play, download). " +
        "FIRST, NARROW THE REQUEST — DO NOT GUESS. If the request is open-ended or a " +
        'use-case ("music for a drone video", "a wedding", "a podcast intro", "my vlog") ' +
        'or a bare genre/mood ("lofi", "something chill", "upbeat"), STOP and ask the user ' +
        "1-2 short questions about the vibe before searching. Offer a few example directions to " +
        "give them a starting point, but keep it OPEN — don't make them pick from a fixed list " +
        '(e.g. "Should it feel upbeat and energetic, calm and emotional, cinematic — or something ' +
        'different? Describe it in your own words."). Then WAIT for their reply. Only call this ' +
        "once the user has given their actual preferences (or explicitly says to just pick). Do " +
        "not invent a mood on their behalf. " +
        "Then call it ONCE with a CONCISE query built from THEIR words — a few distinct " +
        'terms like "calm cinematic" or "sad piano", NEVER a long padded phrase (do NOT ' +
        'send "positive atmospheric background music for drone video cinematic travel"). ' +
        'You can also search by artist ("Pufino") or track title ("Magnificent"); ' +
        "title/artist matches rank first. The returned players ARE your answer — never reply " +
        "that there are too many to show, and never invent a track count. For 'more like " +
        "this' use find_similar; to browse a whole genre/mood use browse_category; for an " +
        "artist's catalog use browse_artist.",
      annotations: trackAnnotations,
      inputSchema: {
        query: z
          .string()
          .describe(
            'What to find — a mood/genre/activity ("upbeat corporate", "sad piano"), an ' +
              'artist ("Pufino"), or a track title ("Magnificent"). Empty = staff picks.',
          ),
        limit: limitArg,
        offset: offsetArg,
        sort: searchSortArg,
      },
      _meta: widgetMeta,
    },
    async ({ query, limit, offset, sort }) =>
      run("search_music", { query, limit, offset, sort }, async () => {
        const q = query ?? "";
        const page = await searchMusic(q, limit, offset ?? 0, sort);
        // A query of only stopwords (e.g. "play some music") yields staff picks,
        // not a real search — label it honestly rather than "N results for …".
        const heading =
          q && hasUsableTerms(q)
            ? `Free To Use — ${page.total} result${plural(page.total)} for "${q}"`
            : "Free To Use — staff picks";
        return {
          heading,
          page,
          more: { tool: "search_music", args: { query: q, limit: page.limit, sort: page.sort } },
        };
      }),
  );

  // find_similar — "more like this", via the API's /related model.
  registerAppTool(
    server,
    "find_similar",
    {
      title: "Find similar Free To Use tracks",
      description:
        "Return tracks with a similar vibe to a given track, shown to the user as players. " +
        "Use when the user asks for 'more like this'. Identify the track by its id (from a " +
        "previous result) OR — if you don't have an id — by passing its title, \"Artist - " +
        'Title", or freetouse.com URL in `track`.',
      annotations: trackAnnotations,
      inputSchema: {
        track_id: z
          .string()
          .max(64)
          .optional()
          .describe("The id of a track from a previous search/browse result."),
        track: z
          .string()
          .max(200)
          .optional()
          .describe('Alternative to track_id: a track title, "Artist - Title", or freetouse.com URL.'),
        limit: limitArg,
        offset: offsetArg,
      },
      _meta: widgetMeta,
    },
    async ({ track_id, track, limit, offset }) =>
      run("find_similar", { track_id, track, limit, offset }, async () => {
        const ref = (track_id && track_id.trim()) || (track && track.trim()) || "";
        const id = await resolveTrackRef(ref);
        if (!id) {
          // Not a recognizable track — answer honestly instead of erroring out.
          return {
            heading: ref
              ? `Couldn't find a Free To Use track matching "${ref}"`
              : "Provide a track (id, title, or URL) to find similar music",
            page: { tracks: [], total: 0, offset: 0, limit: DEFAULT_RESULTS },
            more: { tool: "find_similar", args: { track_id: ref } },
          };
        }
        const page = await findSimilar(id, limit, offset ?? 0);
        return {
          heading: "Similar Free To Use tracks",
          page,
          more: { tool: "find_similar", args: { track_id: id, limit: page.limit } },
        };
      }),
  );

  // browse_category — all tracks in a genre / mood / video use-case.
  registerAppTool(
    server,
    "browse_category",
    {
      title: "Browse a Free To Use category",
      description:
        "List tracks in a category — a genre, mood, or video use-case — shown to the " +
        "user as players. Call list_categories first if unsure of the exact name.",
      annotations: trackAnnotations,
      inputSchema: {
        category: z
          .string()
          .describe('Exact category name, e.g. "Lofi", "Happy", "Vlog". See list_categories.'),
        limit: limitArg,
        offset: offsetArg,
        sort: browseSortArg,
      },
      _meta: widgetMeta,
    },
    async ({ category, limit, offset, sort }) =>
      run("browse_category", { category, limit, offset, sort }, async () => {
        const page = await browseCategory(category, limit, offset ?? 0, sort);
        const heading = `Free To Use — ${page.total} "${category}" track${plural(page.total)}`;
        return {
          heading,
          page,
          more: { tool: "browse_category", args: { category, limit: page.limit, sort: page.sort } },
        };
      }),
  );

  // browse_artist — an artist's whole catalog.
  registerAppTool(
    server,
    "browse_artist",
    {
      title: "Browse a Free To Use artist",
      description:
        "List all tracks by an artist (e.g. \"Pufino\", \"Lukrembo\"), shown to the user as players.",
      annotations: trackAnnotations,
      inputSchema: {
        artist: z.string().describe('Artist name, e.g. "Pufino".'),
        limit: limitArg,
        offset: offsetArg,
        sort: browseSortArg,
      },
      _meta: widgetMeta,
    },
    async ({ artist, limit, offset, sort }) =>
      run("browse_artist", { artist, limit, offset, sort }, async () => {
        const page = await browseArtist(artist, limit, offset ?? 0, sort);
        const heading = `Free To Use — ${page.total} track${plural(page.total)} by ${artist}`;
        return {
          heading,
          page,
          more: { tool: "browse_artist", args: { artist, limit: page.limit, sort: page.sort } },
        };
      }),
  );

  // list_categories — text-only helper so the model knows the browse vocabulary.
  server.registerTool(
    "list_categories",
    {
      title: "List Free To Use categories",
      description:
        "List the available categories (genres, moods, and video use-cases) the user can " +
        "browse, then use browse_category with an exact name.",
      annotations: trackAnnotations,
      inputSchema: {},
    },
    async () => {
      const start = Date.now();
      try {
        const groups = await listCategories();
        console.log(JSON.stringify({ evt: "tool", tool: "list_categories", ms: Date.now() - start, groups: groups.length }));
        const text = groups.map((g) => `**${g.type}**: ${g.categories.join(", ")}`).join("\n\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `Free To Use categories:\n\n${text}\n\nUse browse_category with an exact name.`,
            },
          ],
        };
      } catch (e) {
        console.warn(JSON.stringify({ evt: "tool_error", tool: "list_categories", error: String((e as Error)?.message ?? e) }));
        return errorResult();
      }
    },
  );

  return server;
}

// Stateful Streamable HTTP transport (the pattern remote connectors expect):
// one transport per session, keyed by the mcp-session-id header. Each entry pins
// a full McpServer, so we must not let dropped/abandoned sessions accumulate.
const transports: Record<string, StreamableHTTPServerTransport> = {};
const lastSeen: Record<string, number> = {};
const SESSION_IDLE_MS = 30 * 60 * 1000; // close sessions idle longer than this
const MAX_SESSIONS = 500; // hard cap; evict the oldest beyond it

function touchSession(sessionId: string | undefined): void {
  if (sessionId && transports[sessionId]) lastSeen[sessionId] = Date.now();
}

function closeSession(sessionId: string): void {
  const t = transports[sessionId];
  delete transports[sessionId];
  delete lastSeen[sessionId];
  try {
    t?.close();
  } catch {
    /* ignore */
  }
}

// Evict the oldest sessions beyond the cap. Called on every new session (so a
// burst can't blow past the cap between sweeps) AND from the periodic sweep.
function enforceSessionCap(): void {
  const ids = Object.keys(transports);
  if (ids.length <= MAX_SESSIONS) return;
  ids
    .sort((a, b) => (lastSeen[a] ?? 0) - (lastSeen[b] ?? 0))
    .slice(0, ids.length - MAX_SESSIONS)
    .forEach(closeSession);
}

// Periodically sweep idle sessions, then re-enforce the cap.
const sessionSweeper = setInterval(() => {
  const now = Date.now();
  for (const sid of Object.keys(transports)) {
    if (now - (lastSeen[sid] ?? 0) > SESSION_IDLE_MS) closeSession(sid);
  }
  enforceSessionCap();
}, 60 * 1000);
sessionSweeper.unref?.();

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
    touchSession(sessionId);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
        lastSeen[sid] = Date.now();
        enforceSessionCap();
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        delete lastSeen[transport.sessionId];
      }
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
  touchSession(sessionId);
  await transports[sessionId].handleRequest(req, res);
}

app.get("/mcp", requireAuth, handleSession);
app.delete("/mcp", requireAuth, handleSession);

// Health check for uptime monitors / load balancers.
app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Privacy policy — required for ChatGPT / Claude directory submission.
const PRIVACY_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Free To Use Music — Privacy Policy</title>
<style>body{max-width:720px;margin:40px auto;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d1d1f;line-height:1.6}h1{font-size:24px}h2{font-size:17px;margin-top:28px}a{color:#5b5bd6}small{color:#888}</style>
</head><body>
<h1>Free To Use Music — Privacy Policy</h1>
<p><small>Last updated: June 2026</small></p>
<p>The Free To Use Music connector lets AI assistants (such as ChatGPT and Claude)
search royalty-free music from the public Free To Use catalog and present it as an
inline player. This policy explains what it does and does not do with data.</p>
<h2>No accounts, no personal data</h2>
<p>The connector requires no sign-in and collects no personal information. It does
not ask for, store, or have access to your name, email, chat history, or any
account details. Access is anonymous.</p>
<h2>What the connector does</h2>
<p>When the assistant calls a tool, the connector queries the public Free To Use
API (<a href="https://api.freetouse.com">api.freetouse.com</a>) to find tracks and
returns track details (title, artist, artwork, audio, tags). Cover art and audio
are served directly from Free To Use's content network.</p>
<h2>Operational logs</h2>
<p>For reliability and abuse prevention we keep short-lived server logs that may
include the search terms sent to a tool and timing information. These logs are not
linked to any personal identity, are not used for advertising, and are not sold or
shared with third parties.</p>
<h2>No data selling or sharing</h2>
<p>We do not sell or share any data. The only external service the connector
contacts is the Free To Use API to fulfil your music searches.</p>
<h2>Contact</h2>
<p>Questions? Contact <a href="mailto:hello@freetouse.com">hello@freetouse.com</a>
or visit <a href="https://freetouse.com">freetouse.com</a>.</p>
</body></html>`;

app.get("/privacy", (_req: Request, res: Response) => {
  res.type("html").send(PRIVACY_HTML);
});

// Convenience route: serve the widget standalone so it can be sanity-checked in
// a normal browser, outside any host sandbox/CSP.
app.get("/preview", (_req: Request, res: Response) => {
  // Flag preview mode so the widget shows its demo track here (and ONLY here);
  // inside a real host it waits for actual results instead of flashing a sample.
  res
    .type("html")
    .send(WIDGET_HTML.replace("<body>", '<body><script>window.__FTU_PREVIEW__=true;</script>'));
});

const PORT = Number(process.env.PORT) || 3000;
const httpServer = app.listen(PORT, () => {
  console.log(`Free To Use Music MCP server listening on http://localhost:${PORT}/mcp`);
  // Pre-load the catalog index so the first search is instant.
  warmUp()
    .then((count) => console.log(`Catalog index ready: ${count} tracks.`))
    .catch((e) => console.warn("Catalog index warm-up failed (will retry on first search):", e?.message ?? e));
});

// Graceful shutdown — Render sends SIGTERM on every deploy. Stop accepting new
// connections, close open MCP sessions (freeing their long-lived SSE streams), and
// drop lingering keep-alive sockets so the server can exit promptly. In-flight
// requests may be cut short (clients reconnect/retry), but nothing leaks across the
// restart. A failsafe guarantees exit if draining stalls.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ evt: "shutdown", signal, sessions: Object.keys(transports).length }));
  clearInterval(sessionSweeper);
  httpServer.close(() => process.exit(0));
  for (const sid of Object.keys(transports)) closeSession(sid);
  httpServer.closeAllConnections?.();
  setTimeout(() => process.exit(0), 10000).unref?.();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
