# Free To Use – Integrations Monorepo

Plugins, extensions, and tools built on the [Free To Use](https://freetouse.com) public API.

## Project structure

```
apps/                    # Standalone apps, extensions, and plugins
  chrome-extension/      # Chrome extension (first project)
packages/                # Shared libraries consumed by apps
  ftu-api/               # TypeScript client for api.freetouse.com/v3
```

- **apps/** – Each subdirectory is a deployable artifact (browser extension, CLI tool, web app, etc.).
- **packages/** – Shared code. Apps import these via npm workspace references (e.g. `"@freetouse/api": "*"`).

## Free To Use API

- **Base URL:** `https://api.freetouse.com/v3`
- **Auth:** None required – the API is fully public.
- **OpenAPI spec:** `https://api.freetouse.com/v3/openapi.json`
- **Shared client:** `@freetouse/api` (packages/ftu-api) – always use this instead of calling fetch directly.

### Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/music/tracks/all` | List tracks (paginated) |
| GET | `/music/tracks/search?query=` | Search tracks |
| GET | `/music/tracks/{id}` | Get track by UUID |
| GET | `/music/tracks/{id}/related` | Related tracks |
| GET | `/music/tracks/{artist}/{title}` | Get track by artist + title slug |
| GET | `/music/artists/all` | List artists |
| GET | `/music/artists/{id}` | Get artist by UUID |
| GET | `/music/artists/{id}/tracks` | Artist's tracks |
| GET | `/music/categories/all` | List categories |
| GET | `/music/categories/{id}` | Get category by UUID |
| GET | `/music/categories/{id}/tracks` | Category's tracks |

All list endpoints accept `limit`, `offset`, `order`, and `sort` query params.

## Conventions

- **Language:** TypeScript everywhere.
- **Module format:** ESM (`"type": "module"` in package.json).
- **Package manager:** npm workspaces (root package.json defines workspaces).
- **Naming:** `@freetouse/` scope for shared packages. Apps use plain names.
- **API client:** Always import from `@freetouse/api` – never call `fetch("https://api.freetouse.com/...")` directly in app code.
- **No API keys:** The FTU API requires no authentication. Do not add auth headers.
- **Style guide:** See `packages/ftu-style/STYLE_GUIDE.md` for all design tokens, component patterns, and styling conventions.

## Learnings & gotchas

Hard-won lessons from building integrations. Read these before starting a new app.

### API pagination

- `offset` is the index to start fetching from. After loading 20 tracks, the next fetch should use `offset: 20`, not `offset: 40`.
- When implementing "Load more", use the current offset directly — don't add `PAGE_SIZE` before fetching. Update the offset *after* the response with `offset + res.data.length`.
- Default track ordering is `order: "staff_order"`. Search results use `order: "downloads", sort: "desc"`.
- Fetching N tracks at once (e.g. `limit: 40, offset: 0`) returns the same results in the same order as fetching them in pages (`limit: 20, offset: 0` then `limit: 20, offset: 20`).

### State restoration (scroll position, loaded tracks, etc.)

- When restoring UI state on mount, multiple React state setters in the same callback are batched but can still cause effects to fire multiple times as each state change propagates.
- If using a ref to hold a one-time override (e.g. `nextFetchLimitRef` for restoring track count), **don't clear it eagerly**. Only clear it inside the `.then()` of a successful, non-aborted fetch. Otherwise an intermediate aborted fetch clears the ref before the real fetch reads it.
- To restore scroll position after re-fetching data: save the scroll position, fetch enough data to fill the view (`limit = savedTrackCount`), then use `requestAnimationFrame` (double-nested) to set `scrollTop` after the DOM has rendered.
- For horizontal scroll (e.g. category bar): use a callback ref to attach the scroll listener and restore scroll position on mount.

### Chrome extension specifics

- **Session vs local storage:** Use `chrome.storage.session` for UI state (scroll position, selected category, category order, track count). Session storage clears when the browser fully closes, which is the right behavior — users expect a fresh start on browser relaunch. Don't use `chrome.storage.local` for transient UI state.
- **Offscreen document:** Chrome only allows one offscreen document at a time. Guard `createDocument()` with a shared promise and catch "already exists" errors. Always check `hasDocument()` first.
- **Audio playback:** Use the Web Audio API with a `GainNode` between the audio element and speakers. Fade out (60ms `linearRampToValueAtTime` to 0) before switching tracks, fade in (60ms ramp to 1) on play. This eliminates the audible pop/blip when switching.
- **`audio.play()` AbortError:** When switching tracks quickly, `play()` promises reject with `AbortError` because a new `src` assignment or `pause()` interrupts them. Wrap `play()` in a helper that catches and ignores `AbortError` — it's expected, not an error.
- **Download shelf:** Call `chrome.downloads.setShelfEnabled(false)` before triggering a download to prevent Chrome's download bar from covering the extension popup.
- **Media Session API:** Set `navigator.mediaSession.metadata` with `MediaMetadata` (title, artist, artwork at multiple sizes) so Chrome's media controls show track info and cover art.
- **Manifest permissions:** `offscreen`, `downloads`, `downloads.shelf`, `storage` are the core permissions needed for a music player extension.

### Categories

- Shuffle category order randomly on first load per browser session. Persist the shuffled order in `chrome.storage.session` so it stays consistent across popup opens/closes but re-shuffles on browser restart.
- "All" category is always first — it's hardcoded in the UI, not part of the shuffled list.

### Skeleton loading placeholders

- Match the exact dimensions of real content (cover art size, title/artist bar heights) to prevent layout shift when content loads.
- Use a subtle shimmer animation: `linear-gradient(90deg, #f7f7f7 25%, #f2f2f2 50%, #f7f7f7 75%)` with `background-size: 200%` sweeping left-to-right over 1.5s.
- Set `pointer-events: none` on skeleton items.
- Default to 8 skeleton rows to fill the viewport.

### External links

- Purchase license URL pattern: `https://freetouse.com/music/{artist-slug}/{title-slug}/license`
- Slugs: lowercase, spaces → dashes, strip non-alphanumeric characters.
- Standard footer links: Subscription Plans (`/music/plans`), Usage Policy (`/usage-policy`), FAQ (`/faq`), Blog (`/blog`).
