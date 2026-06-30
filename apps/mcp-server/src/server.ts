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
  listCategories,
  hasUsableTerms,
  warmUp,
  formatDuration,
  DEFAULT_RESULTS,
  MAX_RESULTS,
  type TrackPage,
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
  "NARROW BEFORE SEARCHING. When a request is broad or open-ended — a bare genre or",
  'mood ("lofi", "something chill") or a use-case ("music for a drone video", "a',
  'wedding", "a podcast intro") — first ask 1-2 short clarifying questions to pin',
  "down the vibe (mood/energy, tempo, instrumentation, or the kind of scene/video).",
  "Keep it to one brief message, not an interrogation. Once the user answers (or if",
  "the request is already specific), call search_music once with a concise refined",
  "query (a few distinct words like \"calm lofi piano\", not a pile of synonyms) and",
  "show the results. browse_category lists a whole genre/mood; browse_artist lists",
  "an artist's catalog; find_similar finds more like a given track.",
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
  const credit =
    '\n\nThese tracks are free to use with attribution. Credit each as: "Music track: <title> by <artist>, Source: https://freetouse.com/music".';
  return `${heading}\n\n${body}${more}${credit}`;
}

// Dual-channel tool result: model-facing text + widget structuredContent.
function pageResult(heading: string, page: TrackPage, more: MoreRef | null) {
  const hasMore = page.offset + page.tracks.length < page.total;
  return {
    content: [{ type: "text" as const, text: formatPage(heading, page) }],
    structuredContent: {
      heading,
      tracks: page.tracks,
      offset: page.offset,
      limit: page.limit,
      total: page.total,
      more: hasMore ? more : null,
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
  const trackAnnotations = { readOnlyHint: true, openWorldHint: true };
  const widgetMeta = { ui: { resourceUri: WIDGET_URI } };

  // search_music — the primary entry point.
  registerAppTool(
    server,
    "search_music",
    {
      title: "Search Free To Use music",
      description:
        "Find royalty-free Free To Use music and present it to the user. The tracks " +
        "returned are shown to the user as interactive players (cover, waveform, play, " +
        "download), so the result of ONE call IS your answer — make that single call " +
        "return exactly the tracks the user should see. Put the request straight into " +
        'the query: a mood/genre/activity ("calm piano", "energetic workout", "lofi"), ' +
        'an artist ("Pufino"), or a track title ("Magnificent"). Title/artist matches ' +
        "rank first. Keep the query CONCISE — 1-3 words capturing the core request; do " +
        'NOT pad it with many synonyms (e.g. use "lofi", not "lo-fi lofi chill study hip ' +
        'hop"), as extra terms broaden the results. If the request is broad (a bare ' +
        "genre/mood, or a use-case like a drone video or wedding), ask the user 1-2 quick " +
        "clarifying questions to narrow the vibe BEFORE calling this. Present the returned " +
        "players as your answer — never reply that there are too many to show, and never " +
        "invent a track count. For 'more like this' use find_similar; to browse a genre/mood " +
        "use browse_category; for an artist's catalog use browse_artist.",
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
      },
      _meta: widgetMeta,
    },
    async ({ query, limit, offset }) =>
      run("search_music", { query, limit, offset }, async () => {
        const q = query ?? "";
        const page = await searchMusic(q, limit, offset ?? 0);
        // A query of only stopwords (e.g. "play some music") yields staff picks,
        // not a real search — label it honestly rather than "N results for …".
        const heading =
          q && hasUsableTerms(q)
            ? `Free To Use — ${page.total} result${plural(page.total)} for "${q}"`
            : "Free To Use — staff picks";
        return { heading, page, more: { tool: "search_music", args: { query: q, limit: page.limit } } };
      }),
  );

  // find_similar — "more like this", via the API's /related model.
  registerAppTool(
    server,
    "find_similar",
    {
      title: "Find similar Free To Use tracks",
      description:
        "Given the id of a track from a previous result, return tracks with a similar " +
        "vibe, shown to the user as players. Use when the user asks for 'more like this'.",
      annotations: trackAnnotations,
      inputSchema: {
        track_id: z.string().describe("The id of a track from a previous search/browse result."),
        limit: limitArg,
        offset: offsetArg,
      },
      _meta: widgetMeta,
    },
    async ({ track_id, limit, offset }) =>
      run("find_similar", { track_id, limit, offset }, async () => {
        const page = await findSimilar(track_id, limit, offset ?? 0);
        return {
          heading: "Similar Free To Use tracks",
          page,
          more: { tool: "find_similar", args: { track_id, limit: page.limit } },
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
      },
      _meta: widgetMeta,
    },
    async ({ category, limit, offset }) =>
      run("browse_category", { category, limit, offset }, async () => {
        const page = await browseCategory(category, limit, offset ?? 0);
        const heading = `Free To Use — ${page.total} "${category}" track${plural(page.total)}`;
        return { heading, page, more: { tool: "browse_category", args: { category, limit: page.limit } } };
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
      },
      _meta: widgetMeta,
    },
    async ({ artist, limit, offset }) =>
      run("browse_artist", { artist, limit, offset }, async () => {
        const page = await browseArtist(artist, limit, offset ?? 0);
        const heading = `Free To Use — ${page.total} track${plural(page.total)} by ${artist}`;
        return { heading, page, more: { tool: "browse_artist", args: { artist, limit: page.limit } } };
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
app.listen(PORT, () => {
  console.log(`Free To Use Music MCP server listening on http://localhost:${PORT}/mcp`);
  // Pre-load the catalog index so the first search is instant.
  warmUp()
    .then((count) => console.log(`Catalog index ready: ${count} tracks.`))
    .catch((e) => console.warn("Catalog index warm-up failed (will retry on first search):", e?.message ?? e));
});
