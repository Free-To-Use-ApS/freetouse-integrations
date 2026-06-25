# Free To Use — MCP Server

A remote [MCP](https://modelcontextprotocol.io) server that lets AI assistants
(Claude, ChatGPT, and other MCP hosts) **find and play royalty-free Free To Use
music** inside the chat.

It exposes one tool, `search_music`, that:

- **Always** returns a clean text list — each track with a few tags, a short
  description, and a **Listen & download** link. This is what hosts that don't
  render UI show today (e.g. Claude).
- **Also** carries an inline **player widget** (cover art, tag chips, per-track
  play) via the [MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
  standard. Hosts that render UI (e.g. ChatGPT) show that instead. When a host
  ships widget rendering, the **same tool lights up with no changes here**.

## How search works

The public FTU API's text search is strict (multi-word natural-language queries
often return nothing), so this server keeps the **whole catalog in memory** (one
`/tracks/all` request, refreshed every 6h) and ranks it locally by how well each
track's **tags, categories, genre, and title** match the query. This is robust
to phrasing ("calm piano for studying", "energetic workout", "epic trailer"),
instant per search, and easy on the API.

Heavy fields (the 300-point waveform, play/view stats) are never returned — only
a trimmed shape goes to the model and widget.

## Run locally

```bash
# from the monorepo root
npm install
npm run build -w ftu-mcp-server
npm run start -w ftu-mcp-server     # http://localhost:3000/mcp
```

- `GET /preview` — open in a browser to see the widget standalone.
- `GET /healthz` — health check for uptime monitors / load balancers.

### Test it in Claude / ChatGPT (no deploy)

One command builds, opens a public tunnel, and prints the URL to paste:

```bash
npm run tunnel -w ftu-mcp-server
```

Copy the printed `https://….trycloudflare.com/mcp` into the host's custom-connector
settings. The tunnel URL changes each run, so update the connector URL each time
(a real deploy with a fixed domain removes this).

## Configuration

| Env var       | Default                 | Purpose |
|---------------|-------------------------|---------|
| `PORT`        | `3000`                  | Listen port |
| `PUBLIC_URL`  | `http://localhost:3000` | The address clients reach the server at. **Must** be the externally-visible URL (tunnel/host) because the OAuth discovery documents advertise absolute URLs. The `tunnel` script sets this automatically. |
| `AUTH_SECRET` | _(random per start)_    | HMAC secret for signing JWT tokens. **Set this in production** (any long random string) so tokens survive restarts; share the same value across instances if you run more than one. If unset, a random secret is generated each start and existing tokens stop working on restart. |

## Deploy

### Render (recommended)

This repo ships a `render.yaml` blueprint at the root. To deploy:

1. Push to GitHub.
2. **Render Dashboard → New → Blueprint → connect this repo → Apply.** Render
   reads `render.yaml`, creates the `ftu-mcp-server` web service, generates a
   persistent `AUTH_SECRET`, builds, and deploys. It auto-redeploys on every
   push to `main`.
3. When it's live, your MCP endpoint is `https://<service>.onrender.com/mcp`.
   `PUBLIC_URL` is auto-derived from Render's `RENDER_EXTERNAL_URL` — nothing to
   configure.
4. Add that `…/mcp` URL as a custom connector in Claude / ChatGPT.

The `free` plan spins down when idle (the first request after inactivity is slow
while it wakes and warms the catalog). Set `plan: starter` in `render.yaml` for
an always-on service.

### Any Node host (manual)

Build, then run the compiled output with `PUBLIC_URL` set to the public HTTPS URL:

```bash
npm ci
npm run build -w @freetouse/api -w ftu-mcp-server
PUBLIC_URL="https://music-mcp.yourdomain.com" node apps/mcp-server/dist/server.js
```

Put it behind HTTPS (the platforms require it). A `Dockerfile` is included as a
starting point (build context = monorepo root):

```bash
docker build -f apps/mcp-server/Dockerfile -t ftu-mcp-server .
docker run -p 3000:3000 -e PUBLIC_URL="https://music-mcp.yourdomain.com" ftu-mcp-server
```

### Scaling note

Sessions and OAuth tokens are held in memory, so this runs as a **single
instance**. That's fine behind one host. For multiple replicas you'd move
session/token state to a shared store (e.g. Redis) or switch to stateless
(signed JWT) access tokens.

## Authentication

Claude's custom connectors **require** an OAuth 2.1 handshake, so this server
implements the full flow (discovery, dynamic client registration, authorize,
token, refresh) in `src/auth.ts`. It is **anonymous** — there is no login, anyone
who connects is approved — which is intentional for a *public* service over a
*public* API (no user data to protect). Abuse of your hosting is mitigated by
rate limiting (120 req/min/IP on `/mcp`).

It is **stateless**: client registrations, authorization codes, and access /
refresh tokens are all signed JWTs (HS256), so the server keeps no session
state, tokens survive restarts, and it scales across instances. The only
requirement is a stable signing secret — **set `AUTH_SECRET` in production**
(and share it across instances).

If you later need to identify or limit individual users (e.g. for quotas or
monetization), replace `AnonymousJwtOAuthProvider` with a real authorization
server / identity provider.

## Project layout

```
src/
  server.ts         Express app: OAuth, Streamable HTTP transport, the search_music tool
  ftu.ts            Catalog index + query ranking + trimming + description synthesis
  widget.ts         Results-widget HTML/CSS shell (inlines the bundled client JS)
  widget-client.ts  Widget logic: render track list, inline playback, host bridges
  auth.ts           Anonymous, stateless JWT OAuth provider (see Authentication above)
start.sh            One-command build + tunnel + run for host testing
```
