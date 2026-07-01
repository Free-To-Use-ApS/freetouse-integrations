import { readFileSync } from "node:fs";
import { FONT_CSS } from "./fonts.js";

// Static shell + styling for the results widget — a list of Free To Use
// mini-players matching freetouse.com (flush cover, title/artist, centered tag
// pills, play, symmetric waveform scrubber, duration, download). Interactive
// logic lives in widget-client.ts (bundled by esbuild, inlined below).
// The .ftu-wave / .ftu-wave-bar rules mirror packages/ftu-style waveform.css.

// Nunito is embedded (base64 @font-face in FONT_CSS) rather than linked, because
// host iframes (ChatGPT) strip external <link>/@import — embedding is the only
// way the brand font reliably loads.
const CSS = `
  ${FONT_CSS}
  :root {
    --ftu-primary: #7569de;
    --ftu-primary-hover: #635ecc;
    --ftu-secondary: #383838;
    --ftu-light-grey: #d1d1d1;

    /* Semantic theme tokens (light defaults). The widget follows the host's
       colour scheme — widget-client sets data-theme="dark" on <html> when the
       host reports a dark theme (or the OS prefers dark). The page background
       stays transparent so the widget blends into the chat surface either way. */
    --text: #383838;
    --text-muted: #8a8a8a;
    --text-faint: #9a9a9a;
    --chip-text: #7a7a7a;
    --chip-text-hover: #5f5f5f;
    --surface: #ffffff;
    --surface-2: #f2f2f4;
    --surface-3: #f7f7f8;
    --surface-hover: #f6f6f7;
    --border: #ededed;
    --border-strong: #dcdcdc;
    --chip-hover: #e6e6ec;
    --shadow-card: 0 1px 2px rgba(0,0,0,.04);
    --shadow-modal: 0 22px 55px rgba(0,0,0,.30), 0 8px 20px rgba(0,0,0,.16);
  }
  [data-theme="dark"] {
    --ftu-secondary: #ececec;   /* used only as a foreground text colour */
    --ftu-light-grey: #4b4b54;  /* waveform resting bar */
    --text: #ececec;
    --text-muted: #9a9aa2;
    --text-faint: #8f8f98;
    --chip-text: #b2b2ba;
    --chip-text-hover: #d4d4dc;
    --surface: #1f1f24;
    --surface-2: #2c2c33;
    --surface-3: #26262c;
    --surface-hover: #33333b;
    --border: #34343c;
    --border-strong: #45454f;
    --chip-hover: #3a3a43;
    --shadow-card: 0 1px 2px rgba(0,0,0,.35);
    --shadow-modal: 0 22px 55px rgba(0,0,0,.62), 0 8px 20px rgba(0,0,0,.5);
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--text); }
  /* Force Nunito with high specificity in case the host injects its own font. */
  .head, .title, .artist, .chip, .dur, .attr-title, .attr-desc, .attr-line { font-family: "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; }
  /* Header row holds only the sort dropdown (the "N results for …" heading is
     hidden as redundant with the chat response). Hidden entirely when there's no
     sort to show. */
  .head-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 8px 4px 10px; }
  .head-row.hidden { display: none; }
  .head { display: none; }
  /* Sort dropdown (top-right) — styled to match the Load more button: a fully
     rounded white pill with a soft shadow and a custom chevron (no OS arrow). */
  .sort { font-family: inherit; font-size: 12px; font-weight: 600; color: var(--text); background-color: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 7px 30px 7px 15px; cursor: pointer; flex: none; max-width: 60%; box-shadow: var(--shadow-card); transition: background-color .15s ease, border-color .15s ease; -webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238a8a8a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 13px center; }
  .sort:hover { background-color: var(--surface-hover); border-color: var(--border-strong); }
  .sort:disabled { opacity: .6; cursor: default; }
  .sort.hidden { display: none; }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .empty { padding: 18px 4px; color: var(--text-muted); font-size: 13px; }

  /* Attribution modal — shown after an in-app download (only here, where the
     player renders; on link-only hosts the user sees attribution on the track
     page). modal-open gives the body enough height for the fixed overlay to fit
     even on a short single-track widget. */
  body.modal-open { min-height: 252px; }
  /* Transparent full-viewport layer — no dimming (a dark square looks out of place
     in the otherwise-white chat), but it still catches a click-outside to close. */
  .attr-backdrop { position: fixed; inset: 0; z-index: 100; }
  /* Absolutely positioned in the document; its top is set in JS to the downloaded
     track's position, so it appears where the user clicked. A strong shadow lifts
     it off the (un-dimmed) content. */
  .attr-modal { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 430px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 13px; box-shadow: var(--shadow-modal); z-index: 101; }
  .attr-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .attr-title { font-size: 17px; font-weight: 800; line-height: 1.2; color: var(--text); }
  .attr-close { flex: none; background: none; border: none; cursor: pointer; color: var(--text-faint); padding: 0; display: flex; align-items: center; margin-top: 2px; }
  .attr-close:hover { color: var(--text); }
  .attr-close svg { width: 18px; height: 18px; fill: currentColor; }
  .attr-desc { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text); }
  .attr-box { display: flex; align-items: flex-start; gap: 8px; padding: 12px; background: var(--surface-3); border: 1px solid var(--border); border-radius: 10px; }
  .attr-lines { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .attr-line { font-size: 12px; line-height: 1.5; color: var(--text); word-break: break-word; }
  .attr-copy { flex: none; align-self: flex-start; background: none; border: none; cursor: pointer; color: var(--text-faint); padding: 0; display: flex; align-items: center; transition: color .15s ease; }
  .attr-copy:hover { color: var(--ftu-primary); }
  .attr-copy.copied { color: #34a853; }
  .attr-copy svg { width: 18px; height: 18px; fill: currentColor; }

  /* Card. The frame (border, radius, shadow) and content clipping live on
     .player-clip; .player is a transparent positioning wrapper so the premium
     badge can poke slightly ABOVE the frame without being clipped. overflow:hidden
     on the clip makes the flush cover's left corners follow the card radius while
     its right corners stay square. */
  .player { position: relative; }
  .player-clip { display: flex; align-items: stretch; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-card); }
  .cover { width: 66px; align-self: stretch; object-fit: cover; background: var(--surface-2); flex: none; }
  .body { flex: 1; display: flex; align-items: center; gap: 11px; padding: 9px 14px; min-width: 0; }

  .vdiv { width: 1px; align-self: stretch; background: var(--border); flex: none; margin: 5px 0; }

  .meta { width: 108px; flex: none; min-width: 0; }
  .title { font-weight: 800; font-size: 15px; line-height: 1.25; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .artist { font-weight: 400; font-size: 11px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }

  .chips { width: 76px; flex: none; display: flex; flex-direction: column; gap: 5px; align-items: center; justify-content: center; }
  .chip { max-width: 100%; font-size: 10.5px; font-weight: 400; color: var(--chip-text); background: var(--surface-2); border-radius: 999px; padding: 4px 10px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Cover, title, artist and chips link to freetouse.com (handled in JS). */
  .lnk { cursor: pointer; }
  .cover.lnk:hover { opacity: .9; }
  .chip.lnk:hover { background: var(--chip-hover); color: var(--chip-text-hover); }

  /* Visible keyboard focus for every interactive element. */
  .ftu-wave:focus-visible, .lnk:focus-visible, .play:focus-visible, .dl:focus-visible,
  .license:focus-visible, .loadmore:focus-visible, .sort:focus-visible {
    outline: 2px solid var(--ftu-primary); outline-offset: 2px;
  }
  /* Premium indicator: a bookmark-star in the card's upper-right corner that pokes
     slightly ABOVE the frame (like freetouse.com). Purely a visual flag — the
     licensing action lives on the per-track "Get a license" bag button in the row. */
  .premium-badge { position: absolute; top: -1.5px; right: 8px; z-index: 2; display: flex; align-items: center; line-height: 0; color: var(--ftu-primary); cursor: default; }
  .premium-badge svg { width: 16px; height: 16px; fill: currentColor; }

  /* Load more: a small, neutral (near-black) button tucked into the lower right,
     echoing the player cards (white, hairline border, soft shadow). */
  .more { display: flex; justify-content: flex-end; padding: 10px 0 16px; }
  .loadmore { font-family: inherit; font-size: 12px; font-weight: 600; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 7px 16px; cursor: pointer; box-shadow: var(--shadow-card); transition: background-color .15s ease, border-color .15s ease; }
  .loadmore:hover { background: var(--surface-hover); border-color: var(--border-strong); }
  .loadmore:disabled { opacity: .6; cursor: default; }

  /* The play/pause SVGs include their own circle + colour (grey idle, purple
     playing), so the button is just a sizing wrapper. */
  .play { flex: none; width: 28px; height: 28px; border: none; background: none; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .play svg { width: 100%; height: 100%; display: block; }
  .play:hover { filter: brightness(0.97); }

  /* Symmetric waveform (bars grow from the centre, like freetouse.com) */
  .ftu-wave {
    --wave-bg-base: var(--ftu-light-grey);
    --wave-bg-played: var(--ftu-primary);
    flex: 1; min-width: 60px; height: 2.75rem;
    display: flex; align-items: center; justify-content: space-between;
    column-gap: 1px; position: relative; overflow: hidden; cursor: pointer; touch-action: none;
  }
  /* No CSS transition: the grey->purple fade is JS-driven (Web Animations API) and
     runs only during playback, so a manual seek paints instantly (no flicker). */
  .ftu-wave-bar { display: block; width: 100%; min-height: 2px; border-radius: 1px; background: var(--wave-bg-base); }
  .ftu-wave-bar[data-played="true"] { background-color: var(--wave-bg-played); }
  @media (pointer: fine) {
    .ftu-wave-bar:hover:not([data-played="true"]),
    .ftu-wave-bar:has(~ .ftu-wave-bar:hover ~ .ftu-wave-bar[data-played="true"]),
    .ftu-wave-bar:has(~ .ftu-wave-bar:hover):not(:has(~ .ftu-wave-bar[data-played="true"])) {
      background: var(--wave-bg-played) !important;
      transition: none !important;
    }
  }

  .dur { flex: none; font-size: 9px; font-weight: 400; color: var(--text-muted); background: var(--surface-2); border-radius: 6px; padding: 3px 7px; font-variant-numeric: tabular-nums; }
  /* Row actions: the "Get a license" bag and the download, sharing one look. They
     sit as a tight pair at the right of the card (a small negative gap so the body's
     flex gap doesn't push them apart). */
  .dl, .license { flex: none; width: 32px; height: 34px; border: none; background: none; color: var(--text-faint); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
  .license { margin-right: -4px; }
  .dl { margin-right: 2px; }
  .dl svg { width: 22px; height: 22px; fill: currentColor; }
  .license svg { width: 20px; height: 20px; fill: currentColor; }
  .dl:hover, .license:hover { color: var(--ftu-primary-hover); }
`;

const BODY = `
  <div class="head-row">
    <div class="head" id="head">Free To Use</div>
    <select class="sort hidden" id="sort" aria-label="Sort tracks"></select>
  </div>
  <div class="list" id="list"></div>
  <div class="more" id="more"></div>
  <audio id="audio" preload="none"></audio>
`;

/**
 * Builds the full widget HTML, inlining the esbuild-bundled client JS.
 * Run `npm run build` first so dist/widget-client.js exists.
 */
export function buildWidgetHtml(): string {
  const js = readFileSync(new URL("./widget-client.js", import.meta.url), "utf8").replace(
    /<\/script>/gi,
    "<\\/script>",
  );
  return (
    `<!doctype html><html><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<style>${CSS}</style></head><body>${BODY}<script>${js}</script></body></html>`
  );
}
