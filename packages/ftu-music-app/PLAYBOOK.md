# Free To Use – Music App Playbook

The complete guide for building a new music app on the Free To Use platform. Captures every pattern, bug, and fix learned from building the Chrome extension and Canva app.

> **Read this before starting a new app.** It will save you hours of debugging the same issues twice.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Required dependencies](#2-required-dependencies)
3. [Component structure](#3-component-structure)
4. [Audio player & autoplay](#4-audio-player--autoplay)
5. [Waveform scrubber](#5-waveform-scrubber)
6. [Track list & track item](#6-track-list--track-item)
7. [Categories](#7-categories)
8. [Search](#8-search)
9. [Find Similar / Related Tracks](#9-find-similar--related-tracks)
10. [Attribution modal](#10-attribution-modal)
11. [Loading skeletons](#11-loading-skeletons)
12. [State restoration & persistence](#12-state-restoration--persistence)
13. [Styling system](#13-styling-system)
14. [Player bar](#14-player-bar)
15. [Platform-specific patterns](#15-platform-specific-patterns)
16. [Common bugs & fixes](#16-common-bugs--fixes)
17. [Build checklist](#17-build-checklist)

---

## 1. Architecture overview

Every music app has the same logical layout:

```
┌─────────────────────────────────────────────┐
│ App header                                  │
│   ├── Search bar                            │
│   └── Category pills (horizontal scroll)    │
├─────────────────────────────────────────────┤
│ App content (scrollable)                    │
│   ├── Track list (skeleton during load)     │
│   ├── Load more button                      │
│   └── Footer brand links                    │
├─────────────────────────────────────────────┤
│ App player (fixed bottom)                   │
│   ├── Cover • Title • Artist • Time         │
│   ├── Play/Pause • Add/Download • License   │
│   ├── Waveform scrubber                     │
│   └── License attribution text              │
└─────────────────────────────────────────────┘
```

When a user enters "Related Tracks" view, the header swaps to a back button labeled "Related Tracks". The track list shows tracks similar to the one they clicked. Clicking back returns to the original category, scroll position, and track count — all preserved.

### Provider hierarchy

Every app needs three providers wrapped at the root:

```tsx
<AppUiProvider>           {/* platform-specific theme provider, if any */}
  <AudioPlayerProvider>   {/* shared HTMLAudioElement, playback state, autoplay */}
    <AttributionModalProvider>  {/* shows attribution modal after track is added */}
      <App />
    </AttributionModalProvider>
  </AudioPlayerProvider>
</AppUiProvider>
```

---

## 2. Required dependencies

Every music app should depend on:

```json
"@freetouse/api": "*",     // API client (no auth required)
"@freetouse/style": "*",   // Design tokens, colors, fonts
"react": "^18 or ^19",
"react-dom": "matching"
```

Plus platform-specific deps (Chrome extension SDKs, Canva SDK, etc.).

**Never call `fetch("https://api.freetouse.com/...")` directly.** Always import from `@freetouse/api`. Functions: `getTracks`, `searchTracks`, `getCategories`, `getCategoryTracks`, `getRelatedTracks`, `getArtists`.

---

## 3. Component structure

Mirror this directory layout for consistency. Both reference apps use it:

```
src/
├── components/
│   ├── SearchBar.tsx       # Debounced input with clear button
│   ├── CategoryList.tsx    # Horizontal pill row + skeleton state
│   ├── TrackList.tsx       # Vertical track list + skeleton state + footer links
│   ├── TrackItem.tsx       # Single track row (cover, title, artist, tags, hover actions)
│   ├── Player.tsx          # Bottom player bar with waveform
│   ├── Waveform.tsx        # Clickable + drag-to-scrub waveform
│   └── AttributionModal.tsx # Modal shown after track added
├── hooks/
│   ├── useTracks.ts        # Track + category fetching, pagination, snapshots
│   ├── useAudioPlayer.tsx  # Shared audio element, autoplay, queue
│   └── useAttributionModal.tsx # Provider for the modal
├── utils/
│   ├── format.ts           # slugify, getTrackUrl, getArtistUrl, getLicenseUrl, formatDuration, getArtistNames
│   └── storage.ts          # sessionStorage / chrome.storage wrappers
├── styles/
│   └── app.css             # All app styles (imports @freetouse/style/variables.css)
└── App.tsx (or app.tsx)    # Top-level layout with state coordination
```

---

## 4. Audio player & autoplay

### Single shared audio element

Use ONE `HTMLAudioElement` for the whole app. Store it in a ref inside `AudioPlayerProvider`. Don't let individual components create their own audio elements — playback coordination becomes a nightmare.

### State shape

```ts
interface AudioPlayerState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  ended: boolean;  // Set true when audio ends naturally — drives autoplay
}
```

### Audio events to wire up

```ts
audio.addEventListener("timeupdate", onTimeUpdate);     // updates currentTime
audio.addEventListener("loadedmetadata", onLoadedMetadata); // sets duration
audio.addEventListener("play", onPlay);                 // isPlaying=true, ended=false
audio.addEventListener("pause", onPause);               // isPlaying=false
audio.addEventListener("ended", onEnded);               // ended=true (triggers autoplay)
```

### Queue & autoplay

Track the queue in a `ref` (NOT state — no re-render needed):

```ts
const queueRef = useRef<Track[]>([]);

// play() accepts an optional queue
const play = (track: Track, queue?: Track[]) => {
  if (queue) queueRef.current = queue;
  // ... set src, play, setState
};
```

Pass the **current visible track list** as the queue when the user starts a track:

```tsx
// In TrackItem
player.toggle(track, queue);

// In TrackList
{tracks.map((t) => <TrackItem track={t} queue={tracks} ... />)}
```

Autoplay logic in a `useEffect`:

```ts
useEffect(() => {
  if (!state.ended || !state.track) return;
  const queue = queueRef.current;
  if (queue.length === 0) return;
  const idx = queue.findIndex((t) => t.id === state.track!.id);
  // Fallback to index 0 if track is no longer in queue (user navigated away)
  const nextIdx = idx === -1 ? 0 : (idx + 1) % queue.length;
  play(queue[nextIdx]);
}, [state.ended, state.track, play]);
```

This **wraps around** to the first track when the queue is exhausted.

### `play()` AbortError

When switching tracks quickly, `audio.play()` returns a promise that rejects with `AbortError` because a new `src` assignment interrupts it. **Always wrap `.catch(() => {})`** — it's expected, not an error.

```ts
audio.play().catch(() => {});  // Required
```

### Single-source-of-truth for the play button

The Player bar's play/pause button should call `pause()` / `resume()` directly on the audio element via the provider — don't try to manage a separate "playing" state in the Player component.

### Loudness normalization (per-track volume leveling)

Tracks vary in loudness, so browsing from a loud track to a quiet one (or vice
versa) makes users constantly reach for the volume. Every player normalizes this
the same way, via one shared helper:

```ts
import { waveformToGain } from "@freetouse/api";

const gain = waveformToGain(track.waveform); // attenuate-only multiplier, 0..1
```

Why the waveform: the API exposes **no** true loudness value (no LUFS/RMS/peak).
The only signal is `track.waveform` (300 ints 0–100), normalized to each track's
own peak — so a loud/compressed track sits high across the envelope (high mean)
and a quiet/dynamic one sits lower. The **mean** is therefore a good proxy for
perceived loudness, and `waveformToGain` turns the loud tracks *down* toward a
reference level. It is **attenuate-only** (never returns > 1 — boosting through a
`MediaElementSource` clips), and returns `1` when there's no usable waveform, so
you can apply it unconditionally. Defaults are tuned from the real catalog and
mirror the normalization on freetouse.com; tune via the options arg if needed.

Apply it wherever the player sets volume — **the value is a linear multiplier**,
so it drops straight into either kind of playback path:

- **Web Audio (`GainNode`)** — make the fade-in ramp target `gain` instead of `1`
  (recompute `gain` per track on PLAY). The 60ms fade still works; the
  steady-state level just becomes the normalized one. (Chrome/Edge extensions.)
- **Plain `HTMLAudioElement`** — set `audio.volume = gain` when you assign a new
  `src`. (MCP widget.)
- **No player of your own (data only)** — expose `gain` in your payload so a
  downstream player can apply it. (MCP server adds it to each `UiTrack`.)

Known gap — Canva: the Canva app plays previews through the UI Kit's
`AudioCard`, which encapsulates its own audio element and exposes **no volume
control** (no `volume` prop, no ref method, no access to the element). So Canva
preview cannot be normalized without either a fragile DOM hack into Kit
internals or dropping `AudioCard` for a custom player — neither is worth it.
Canva preview is intentionally left un-normalized. If a future Kit version adds
a volume prop, wire `waveformToGain(track.waveform)` into it.

Caveat: normalization only ever affects **playback**, never the downloaded /
added asset (that's the raw file).

---

## 5. Waveform scrubber

The Free To Use API returns a 300-point loudness array (`track.waveform`). Render it as a row of vertical bars.

### Component shape

```tsx
interface WaveformProps {
  data: number[];        // ~300 integers (0-100)
  progress: number;      // 0-1 progress through the track
  onSeek: (fraction: number) => void;
}
```

### Downsampling

Don't render 300 bars — too dense. Downsample to 80–120 bars depending on width:

```ts
const BAR_COUNT = 120; // 80 for narrower players, 120 for wider
function downsample(data: number[], bars: number): number[] { /* ... */ }
```

### Click + drag to scrub

Use `onPointerDown` with `setPointerCapture` so dragging works even after the cursor leaves the bar:

```ts
const handlePointerDown = (e) => {
  e.currentTarget.setPointerCapture(e.pointerId);
  seekFromX(e.clientX);
  // listen for pointermove/pointerup
};
```

### CRITICAL bug: padding affects seek calculation

If the waveform container has horizontal padding, you **must** subtract it when computing the fraction. Otherwise clicks near the right edge land slightly before the cursor:

```ts
const seekFromX = (clientX: number) => {
  const el = containerRef.current!;
  const rect = el.getBoundingClientRect();
  const styles = getComputedStyle(el);
  const padLeft = parseFloat(styles.paddingLeft) || 0;
  const padRight = parseFloat(styles.paddingRight) || 0;
  const innerLeft = rect.left + padLeft;
  const innerWidth = rect.width - padLeft - padRight;
  const fraction = Math.max(0, Math.min(1, (clientX - innerLeft) / innerWidth));
  onSeek(fraction);
};
```

### Hover preview (CSS, no JS needed)

Bars before+including the hovered bar light up with the played color, previewing where the click will seek. Don't set `pointer-events: none` on bars — it breaks the `:hover` selector.

```css
@media (pointer: fine) {
  .ftu-wave-bar:hover:not([data-played="true"]),
  .ftu-wave-bar:has(~ .ftu-wave-bar:hover ~ .ftu-wave-bar[data-played="true"]),
  .ftu-wave-bar:has(~ .ftu-wave-bar:hover):not(:has(~ .ftu-wave-bar[data-played="true"])) {
    background: var(--ftu-primary) !important;
    transition: none !important;
  }
}
```

---

## 6. Track list & track item

### Track item layout

```
[ Cover ]  Title              [Tags / Hover Actions]
           Artist
```

- **Click** the row → toggles play/pause for that track.
- **Hover** → tags (right side) fade out, action buttons fade in: e.g. `Find Similar` (text link) and `+` icon (add to project / download).
- **Active** state (currently playing) → row gets a subtle background tint.

### Drag-and-drop (Canva-only)

If your platform supports drag-to-project (like Canva), make the row `draggable` and wrap the upload in `resolveAudioRef`:

```tsx
const handleDragStart = (e) => {
  ui.startDragToPoint(event, {
    type: "audio",
    resolveAudioRef: async () => {
      const result = await uploadAudio();
      showAttribution(track);  // Trigger attribution after drop
      return result;
    },
    durationMs: Math.round(track.duration * 1000),
    title: displayTitle,
  });
};
```

### Tags

Show first 1-2 tags from `track.tags_categories`. Style them like the category pills but smaller and lighter — they should feel related to categories but secondary.

---

## 7. Categories

### Initial load

- Fetch via `getCategories({ limit: 200 })`.
- **Shuffle** the order randomly on first load (variety on each browser session).
- **Persist** the shuffled order in session storage so the bar stays consistent across panel open/close. Without persistence, the bar reshuffles every time which feels broken.

### "All" pill

Hardcode the "All" pill as the first item — never include it in the shuffled list.

### Horizontal scroll

```css
.categories {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;       /* Firefox */
  -ms-overflow-style: none;    /* IE */
}
.categories::-webkit-scrollbar { display: none; }  /* WebKit */
```

Persist horizontal scroll position separately so users return to the same spot.

### Toggle behavior

Click an active category to deselect it (back to "All"):

```tsx
onClick={() => onSelect(activeId === cat.id ? null : cat.id)}
```

---

## 8. Search

- **Debounce** 300ms.
- Replace search icon with **clear button (×)** when value is non-empty.
- Setting a search query should **clear the active category** (and vice-versa) — search and category are mutually exclusive.

```tsx
useEffect(() => {
  const timer = setTimeout(() => onSearch(value.trim()), 300);
  return () => clearTimeout(timer);
}, [value, onSearch]);
```

---

## 9. Find Similar / Related Tracks

### Behavior

- Each track item has a "Find Similar" hover action.
- Clicking it loads tracks via `getRelatedTracks(trackId)`.
- The header swaps to a "← Related Tracks" back button.
- Clicking back returns to the **original category and scroll position**, not "All".

### Save the previous view in a ref

```ts
const savedViewRef = useRef<SavedView | null>(null);

const handleFindSimilar = (trackId: string) => {
  if (relatedToId === null) {
    // Coming from a non-related view — capture it
    const scrollTop = contentRef.current?.scrollTop ?? 0;
    savedViewRef.current = {
      query, categoryId, scrollTop,
      snapshot: saveSnapshot(),
    };
    persistView({ /* ... */ previousCategoryId: categoryId });
  } else {
    // Already in related view — keep the saved view, just swap relatedToId
    // (CRITICAL: don't overwrite, else multi-level Find Similar loses the original category)
  }
  setRelatedToId(trackId);
  // ...
};
```

### CRITICAL bug: multi-level Find Similar

When the user clicks Find Similar **from inside** a related view (i.e. they hop from related-A to related-B), the naive code overwrites `savedViewRef` with the *current* state — but the current state has `categoryId = null` (cleared when entering related the first time). So Back loses the original category.

**Fix**: only save the view if `relatedToId` is currently `null`. See section above.

---

## 10. Attribution modal

When a track is added to the user's project (Canva: added to design / Chrome: downloaded), show a modal reminding them to credit the track.

### Provider pattern

Centralize the modal state so any component can trigger it:

```tsx
<AttributionModalProvider>
  <App />  {/* anywhere inside, useAttributionModal().showAttribution(track) */}
</AttributionModalProvider>
```

The provider holds `track | null` state and renders `<AttributionModal>` conditionally.

### Modal content

```
Attribution is required                          [×]

"{Track title} by {Artists}" is free to use in
non-commercial content as long as you provide
attribution.

┌──────────────────────────────────────────┬───┐
│ Music track: {title} by {artists}        │ ⎘ │
│ Source: https://freetouse.com/music      │   │
└──────────────────────────────────────────┴───┘
```

### Copy button

- Default state: clipboard icon, grey
- On hover: turns FTU primary purple
- On copy success: turns FTU green and shows a checkmark icon for 2 seconds, then resets

### Trigger points

Trigger `showAttribution(track)` after EVERY successful add path:
- Click "+" button in TrackItem hover actions
- Click "Add" button in Player
- Drag-and-drop (wrap `resolveAudioRef` to call `showAttribution` after upload)

### Close behavior

- Click backdrop → close
- Press Escape → close
- Stop event propagation on the modal box itself so backdrop click doesn't trigger when clicking inside

---

## 11. Loading skeletons

### Match real dimensions exactly

Skeletons must have the exact same width/height as the real content they replace. Otherwise content "jumps" when it loads — looks broken.

### Track skeleton

```
[ ▓▓▓▓ ]  ▓▓▓▓▓▓▓▓▓▓▓▓ (45% width)        ▓▓▓▓▓ (3rem)
          ▓▓▓▓▓▓▓ (28% width)              ▓▓ (2.25rem)
```

- Cover placeholder: same dimensions as real cover (e.g. `3.25rem` square)
- Title bar height: same as real title font-size (e.g. `0.9375rem`)
- Artist bar height: same as real artist font-size (e.g. `0.8125rem`)
- Tag pills: two stacked, varied widths

### Category skeleton

Render 6-8 pills of varied widths (`3.5rem`, `4.5rem`, `5.25rem`, etc.) using the same `.category-pill` class as real pills (so padding/border-radius/height match exactly). Add `&nbsp;` content so the box has natural row height.

### Count

Render enough skeleton items to fill the typical viewport — 8 for narrow popups, 12-14 for wider Canva-style panels.

### Shimmer animation

```css
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #f7f7f7 25%, #f2f2f2 50%, #f7f7f7 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}
```

---

## 12. State restoration & persistence

### What to persist

- Selected category id
- Vertical scroll position (track list)
- Track count (so we refetch the same amount on restore — see below)
- `relatedToId` (active find-similar view)
- `previousCategoryId`, `previousScrollTop`, `previousTrackCount` (for back navigation across panel close)
- Category bar order (the shuffled order)
- Category bar horizontal scroll position

### Storage backend

- **Chrome extension**: `chrome.storage.session` (clears on browser close — perfect)
- **Canva app / web**: `window.sessionStorage` (clears on tab close)
- **Native app**: equivalent session-scoped storage

Wrap all `sessionStorage` operations in try/catch — it can throw in private browsing or sandboxed contexts.

### Fetch-with-restored-limit pattern

When the user has loaded 60 tracks via "Load more" and reopens the app, you can't restore scroll position to "track 50" if you've only fetched 20 tracks. Solution:

1. On mount, read `trackCount` from storage.
2. If `trackCount > PAGE_SIZE`, pass it to `useTracks` as `initialLimit`.
3. The hook uses this limit on the **first** fetch only.
4. After tracks render, restore the scroll position (use double `requestAnimationFrame` to wait for layout).

### Snapshot pattern for instant Back

When clicking Find Similar, save the current `tracks` array, `hasMore`, and `offset` in a ref. When clicking Back, the hook can `restoreSnapshot()` instantly without refetching. Use a `skipNextFetchRef` flag to prevent the effect from refetching when state changes during restore.

### Scroll restore timing

Browsers don't have stable layout right after `setState`. Use double `requestAnimationFrame`:

```ts
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    contentRef.current.scrollTop = savedScrollTop;
  });
});
```

### Synchronous hydration

Read storage **synchronously** during the first render so `useTracks` gets the right `initialLimit` on its very first run — otherwise you get a flash of "20 tracks loaded then 60 tracks loaded":

```tsx
if (!restored && initialLimitRef.current === 0) {
  const saved = loadView();
  if (saved.trackCount && saved.trackCount > PAGE_SIZE) {
    initialLimitRef.current = saved.trackCount;
  }
  pendingScrollRef.current = saved.scrollTop ?? 0;
}
```

---

## 13. Styling system

### Always import the FTU tokens

```css
@import "@freetouse/style/variables.css";
@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;700;800&display=swap");
```

Use `--ftu-*` variables everywhere instead of hardcoding colors.

### Primary palette (memorize these)

| Token | Value | Use |
|---|---|---|
| `--ftu-primary` | `#7569de` | Brand purple — buttons, active state, played waveform |
| `--ftu-primary-hover` | `#635ecc` | Hover state |
| `--ftu-secondary` | `#383838` | Body text |
| `--ftu-grey` | `#969696` | Secondary text, icons |
| `--ftu-light` | `#f2f2f2` | Active item background |
| `--ftu-lighter` | `#f7f7f7` | Hover background, tag bg, skeleton base |
| `--ftu-white` | `#ffffff` | Card / panel backgrounds |
| `--ftu-green` | `#79c67d` | "Copied" success state |

### Typography

`Nunito` (variable, 300–800) → fallback Montserrat → system. Set `font-family: var(--ftu-font-family)` on body.

### Border radii

| Token | Value | Use |
|---|---|---|
| `--ftu-radius-pill` | `5rem` | Buttons, pills, inputs |
| `--ftu-radius-card` | `1rem` | Track items |
| `--ftu-radius-sm` | `0.75rem` | Cover art, action buttons |
| `--ftu-radius-modal` | `1.375rem` | Modals |

---

## 14. Player bar

### Layout

```
[Cover] Title             0:30 / 1:30  [▶] [+] [🛒]
        Artist
[━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━] (waveform)
{Title} by {Artist} is licensed under the Free To Use License
```

### Title & artist are clickable links

Title → opens `https://freetouse.com/music/{artist-slug}/{title-slug}` (track page).
Artist → opens `https://freetouse.com/music/{artist-slug}` (artist page). Split multiple artists into separate links.

For Canva apps: use `<button>` elements + `requestOpenExternalUrl`. For browser-based apps: use `<a target="_blank" rel="noreferrer">`.

### CRITICAL bug: hover effects breaking layout

Don't put `:hover` in the same CSS rule block as the link's base reset. Adding `:hover` raises specificity above other rules (e.g. `.player-bar-title { font-weight: 750 }`) and `font: inherit` on hover overrides them. Result: text changes weight/size on hover.

**Fix**: separate base reset from hover, and only change `color` on hover. Use a 2-class selector for high enough specificity:

```css
.player-bar-link {
  background: transparent; border: 0; padding: 0; margin: 0;
  font-family: inherit;     /* not `font: inherit` shorthand! */
  color: inherit;
  cursor: pointer;
  text-decoration: none;
  outline: 0;
}
.player-bar-title.player-bar-link:hover { color: var(--ftu-black); }
.player-bar-artist .player-bar-link:hover { color: var(--ftu-grey-hover); }
```

### CRITICAL bug: visited link purple in Chrome extensions

The default browser `:visited` color (purple) bleeds through anchor links unless explicitly overridden:

```css
.player-bar-link:visited { color: inherit; text-decoration: none; }
```

Cover the `:visited` pseudo-class explicitly.

### Action buttons

| Position | Icon | Use |
|---|---|---|
| Center-right | Play (`▶`) / Pause (`⏸`) — 22×22 | Play/pause control |
| Right | Add (`+` filled circle / square) — 17×17 | Add track to project |
| Far right | License (`🛒` shopping bag) — 17×17 | Open license page |

Use Bootstrap Icons family for visual consistency. Plus icons:
- `plus-circle-fill` for round style (player bar)
- `plus-square-fill` for square style (track item hover)

### License attribution text

Always render below the waveform:

```tsx
<strong>{title}</strong> by <strong>{artist}</strong> is licensed under the
<a href="https://freetouse.com/license">Free To Use License</a>
```

---

## 15. Platform-specific patterns

### Chrome extension

- **Manifest v3** with permissions: `offscreen`, `downloads`, `downloads.shelf`, `storage`
- **Offscreen document** for audio playback (Chrome only allows one — guard `createDocument()` with a shared promise, catch "already exists")
- **Web Audio API** with a `GainNode` for fade-in/out (60ms ramp) — eliminates audio pop on track switch. The same node carries the per-track **loudness-normalization** gain: fade-in ramps to `waveformToGain(track.waveform)` instead of `1` (see §4). Applies to the Edge extension too.
- **chrome.downloads.setShelfEnabled(false)** before download — prevents Chrome's download bar from covering the popup
- **Media Session API** — set `navigator.mediaSession.metadata` so Chrome's media controls show track info
- **Storage**: `chrome.storage.session` for UI state (clears on browser close)

### Canva app

- **Webpack 5** required (Vite doesn't work with Canva runtime)
- **HTTPS dev server** required (Canva blocks HTTP localhost)
- **`prepareDesignEditor(designEditor)`** in entry — registers the intent
- **`@canva/app-ui-kit`** for theme/provider; can be used minimally if you build custom components
- **`@canva/asset` `upload()`** — needs public CDN URLs, mimeType, durationMs
- **`addAudioTrack({ ref })`** — adds track to design timeline
- **`ui.startDragToPoint`** — drag-and-drop to design (independent of any UI component)
- **`requestOpenExternalUrl({ url })`** — for any outbound link (no anchor tags work)
- **`useFeatureSupport()`** — returns a function `(...features) => boolean`. Check `isSupported(addAudioTrack)` to know if audio is supported in the current design type
- **CORS**: production needs api.freetouse.com configured to allow your specific app subdomain (e.g. `https://app-aahaabwtafg.canva-apps.com`). Wildcard subdomains aren't an option.
- **`html { font-size: 62.5% }`** is set by Canva's UI Kit. Override with `html { font-size: 16px !important }` so your `rem`-based sizes render at expected pixels.

### Other platforms (Wordpress, Premiere, mobile, etc.)

When you build for a new platform, add a section here documenting its quirks.

---

## 16. Common bugs & fixes

A reference of every non-obvious bug we hit and how it was fixed. Skim this BEFORE starting; debugging the same thing twice is a waste.

| Symptom | Cause | Fix |
|---|---|---|
| Track title font weight / size changes on hover | `font: inherit` in `.player-bar-link:hover` overrides higher-up rules due to specificity | Don't include `:hover` in the base reset block; only change `color` on hover; use `font-family: inherit` not `font: inherit` |
| Visited links show browser default purple | `a, a:hover` overrides don't cover `:visited` | Add `.player-bar-link:visited { color: inherit; }` explicitly |
| Waveform clicks near right edge seek too early | `rect.width` includes container padding | Subtract `padding-left` and `padding-right` from the inner-width calc using `getComputedStyle()` |
| Hover preview doesn't show on waveform bars | `pointer-events: none` on `.ftu-wave-bar` blocks `:hover` | Remove `pointer-events: none` — events still bubble to container |
| `audio.play()` rejects with `AbortError` | New `src` assignment interrupts the previous play promise | Wrap with `.catch(() => {})` — expected behavior |
| `rem` sizes render way smaller than expected (Canva) | Canva UI Kit sets `html { font-size: 62.5% }` (=10px) | Override with `html { font-size: 16px !important; }` |
| Back from related-of-related goes to "All" instead of original category | `handleFindSimilar` overwrites `savedViewRef` with current state (which has `categoryId=null`) | Only save the view if `relatedToId === null` (i.e. coming from a non-related view) |
| Track list flashes 20-then-60 tracks on reopen | Storage read happens after first fetch | Read storage **synchronously** during render to seed `initialLimit` before the hook runs |
| Scroll position doesn't restore | Setting `scrollTop` runs before layout settles | Use double `requestAnimationFrame` |
| Audio plays multiple tracks at once | Each component creates its own `<audio>` | Single shared element via `AudioPlayerProvider` |
| Categories reshuffle every time | No persistence | Persist shuffled order in session storage; restore on next load |
| Hover background extends past content edges | `.app-content` and `.app-header` have different horizontal padding | Use a CSS variable (`--content-x`) for consistent left/right alignment |
| Skeleton swap causes layout shift | Skeleton dimensions don't match real content | Use the same exact dimensions (cover size, font sizes) as real content |
| Modal backdrop click also fires on modal content click | Event bubbling | Stop propagation on the modal box: `onClick={(e) => e.stopPropagation()}` |
| Drag-to-design doesn't trigger attribution modal | Modal only triggered from button onClick | Wrap `resolveAudioRef` to call `showAttribution(track)` after upload |
| `useFeatureSupport` returns "an object" but errors when destructured | API returns a function, not an object | `const isSupported = useFeatureSupport(); isSupported(addAudioTrack)` — call it as a function |
| Chrome extension popup loads with no service worker | `vite build --config vite.config.sw.ts` was skipped | Always run `npm run build` (full), not `npm run build:popup` alone |

---

## 17. Build checklist

Before considering an app "done", verify:

- [ ] **Layout**: header / scrollable content / fixed player bar
- [ ] **Search**: debounced, clears category, has clear button
- [ ] **Categories**: shuffled, persisted order, "All" first, horizontal scroll persisted
- [ ] **Track list**: skeleton placeholders matching real dimensions, ~8-12 of them
- [ ] **Track item**: click to play, hover swaps tags ↔ actions, drag-to-project (if applicable)
- [ ] **Player**: cover/title/artist clickable to FTU pages, time, play/pause, add/download, license
- [ ] **Waveform**: clickable + drag-to-scrub, hover preview, padding-corrected seek
- [ ] **Autoplay**: ends → next track in queue, wraps to first after last
- [ ] **Find Similar**: hover action on each track, "Related Tracks" header with back button
- [ ] **State restoration**: category, scroll position, track count, related view all survive panel close+reopen
- [ ] **Multi-level Find Similar**: Back returns to ORIGINAL category (not "All")
- [ ] **Attribution modal**: shows after every add path (button click + drag-and-drop), has copy button with green checkmark
- [ ] **Loading**: skeletons show on initial load AND on category/search change
- [ ] **Branding**: FTU primary purple, Nunito, FTU border radii
- [ ] **No console errors** in normal flow
- [ ] **Dark mode** (if platform requires it)

If any item is missing, refer back to the relevant section above.
