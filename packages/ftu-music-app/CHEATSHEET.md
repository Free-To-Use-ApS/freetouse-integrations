# Music App Cheatsheet

A one-page reference. Use alongside `PLAYBOOK.md`.

## File scaffold to copy

```
src/
├── App.tsx                    # State coordination, providers, layout
├── components/
│   ├── SearchBar.tsx
│   ├── CategoryList.tsx
│   ├── TrackList.tsx
│   ├── TrackItem.tsx
│   ├── Player.tsx
│   ├── Waveform.tsx
│   └── AttributionModal.tsx
├── hooks/
│   ├── useTracks.ts
│   ├── useAudioPlayer.tsx
│   └── useAttributionModal.tsx
├── utils/
│   ├── format.ts        # slugify, getTrackUrl, getArtistUrl, getLicenseUrl, formatDuration, getArtistNames
│   └── storage.ts       # session-scoped persistence wrapper
├── styles/app.css
└── index.tsx (or main.tsx)
```

Start by copying from the closer reference app:
- Browser/web → `apps/chrome-extension/src/popup/`
- Editor plugin → `apps/canva-app/src/intents/design_editor/` and `src/components/`

## Required FTU API endpoints

```ts
import {
  getTracks,           // GET /music/tracks/all       (paginated)
  searchTracks,        // GET /music/tracks/search
  getRelatedTracks,    // GET /music/tracks/{id}/related
  getCategories,       // GET /music/categories/all
  getCategoryTracks,   // GET /music/categories/{id}/tracks
} from "@freetouse/api";
```

Pagination: `{ limit, offset, order }`. Default page size: **20**.

## Provider tree (root)

```tsx
<PlatformThemeProvider>           {/* AppUiProvider in Canva, etc. */}
  <AudioPlayerProvider>
    <AttributionModalProvider>
      <App />
    </AttributionModalProvider>
  </AudioPlayerProvider>
</PlatformThemeProvider>
```

## Must-have features

1. ✅ Search (debounced 300ms) + clear button
2. ✅ Categories (shuffled, persisted order, "All" first)
3. ✅ Track list with skeleton placeholders
4. ✅ Click to play, hover to reveal Find Similar + Add actions
5. ✅ Drag-and-drop to project (if platform supports)
6. ✅ Player bar with cover, title, artist, time, controls, waveform, license text
7. ✅ Waveform: click to seek, drag to scrub, hover preview, padding-corrected math
8. ✅ Autoplay on track end, wraps to first
9. ✅ Find Similar with back navigation; Back returns to original category
10. ✅ Attribution modal after every add path (including drag-and-drop)
11. ✅ State persistence across panel close/reopen
12. ✅ Title + artist in player are clickable links to freetouse.com pages

## Common URL patterns

```
Track page:    https://freetouse.com/music/{artist-slug}/{title-slug}
Artist page:   https://freetouse.com/music/{artist-slug}
License page:  https://freetouse.com/music/{artist-slug}/{title-slug}/license
License terms: https://freetouse.com/license
Plans:         https://freetouse.com/music/plans
Usage policy:  https://freetouse.com/usage-policy
FAQ:           https://freetouse.com/faq
Blog:          https://freetouse.com/blog
```

`slugify(s) = s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")`

## Track type quick reference

```ts
interface Track {
  id: string;
  title: string;
  duration: number;                       // seconds
  files: { mp3: string };                 // public CDN URL
  thumbnails: { sm; md; lg; xl: string };
  waveform: number[];                     // ~300 ints, 0–100; also loudness source
  artists: [number, { id; name: string }][];
  tags_categories: [number, string | { name: string }][];
}
```

**Loudness normalization:** the API has no LUFS/peak field, so loud tracks blast
quiet ones while browsing. `waveformToGain(track.waveform)` (from `@freetouse/api`)
returns an attenuate-only multiplier (0..1) from the waveform mean. Apply it as
the Web Audio fade-in target (extensions) or `audio.volume` (Canva preview, MCP
widget); the MCP server also ships it as `track.gain`. Never boosts (clips);
returns 1 with no waveform. See PLAYBOOK §4.

## Top 10 gotchas (read before coding!)

1. **Wrap `audio.play()` with `.catch(() => {})`** — AbortError on rapid track switches is normal.
2. **`pointer-events: none` on waveform bars BREAKS hover preview.** Don't add it.
3. **Subtract container padding from waveform width** when computing seek fraction.
4. **`html { font-size: 62.5% }`** in Canva UI Kit — override with `!important` to 16px.
5. **Browser default `:visited` is purple.** Cover it explicitly on link styles.
6. **Don't put `:hover` in the same rule as `font: inherit`.** It will override font-weight on hover. Use `font-family: inherit` and only change `color` on hover.
7. **Multi-level Find Similar**: only save `savedViewRef` if `relatedToId === null`, else Back loses original category.
8. **Read sessionStorage SYNCHRONOUSLY** during first render to seed `useTracks` `initialLimit`. Otherwise tracks flash 20→60.
9. **Double `requestAnimationFrame`** for scroll restoration after data loads.
10. **Single shared `<audio>` element** in the AudioPlayerProvider. Never let components create their own.

## Reference apps to copy from

| Need | Reference |
|---|---|
| Chrome MV3 manifest, offscreen audio, downloads | `apps/chrome-extension/` |
| Canva intent registration, drag-to-design, asset upload | `apps/canva-app/` |
| Bottom player bar with waveform | Either app's `components/Player.tsx` |
| State restoration logic | Either app's `App.tsx` (search "savedViewRef") |
| Skeleton placeholders | Either app's `components/TrackList.tsx` and `components/CategoryList.tsx` |
| Attribution modal | Either app's `components/AttributionModal.tsx` |
| URL helpers | `apps/canva-app/src/utils/format.ts` |
