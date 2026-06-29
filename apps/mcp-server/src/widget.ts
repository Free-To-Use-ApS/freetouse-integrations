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
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ftu-secondary); }
  /* Force Nunito with high specificity in case the host injects its own font. */
  .head, .title, .artist, .chip, .dur { font-family: "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; }
  .head { font-size: 13px; color: #8a8a8a; font-weight: 600; padding: 8px 4px 10px; }
  .list { display: flex; flex-direction: column; gap: 10px; }

  /* Card. The frame (border, radius, shadow) and content clipping live on
     .player-clip; .player is a transparent positioning wrapper so the premium
     badge can poke slightly ABOVE the frame without being clipped. overflow:hidden
     on the clip makes the flush cover's left corners follow the card radius while
     its right corners stay square. */
  .player { position: relative; }
  .player-clip { display: flex; align-items: stretch; background: #fff; border: 1px solid #ededed; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .cover { width: 66px; align-self: stretch; object-fit: cover; background: #f1f1f1; flex: none; }
  .body { flex: 1; display: flex; align-items: center; gap: 11px; padding: 9px 14px; min-width: 0; }

  .vdiv { width: 1px; align-self: stretch; background: #ededed; flex: none; margin: 5px 0; }

  .meta { width: 108px; flex: none; min-width: 0; }
  .title { font-weight: 800; font-size: 14px; line-height: 1.25; color: var(--ftu-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .artist { font-weight: 400; font-size: 11px; color: var(--ftu-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }

  .chips { width: 76px; flex: none; display: flex; flex-direction: column; gap: 5px; align-items: center; justify-content: center; }
  .chip { max-width: 100%; font-size: 10.5px; font-weight: 400; color: #7a7a7a; background: #f2f2f4; border-radius: 999px; padding: 4px 10px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Cover, title, artist and chips link to freetouse.com (handled in JS). */
  .lnk { cursor: pointer; }
  .cover.lnk:hover { opacity: .9; }
  .title.lnk:hover, .artist.lnk:hover { text-decoration: underline; }
  .chip.lnk:hover { background: #e6e6ec; color: #5f5f5f; }
  /* Premium indicator: a bookmark-star in the card's upper-right corner that pokes
     slightly ABOVE the frame (like freetouse.com). It sits clear above the download
     button so it never blocks the button, and stays hoverable for the "Premium
     Track" tooltip (hence no pointer-events:none). */
  .premium-badge { position: absolute; top: -1.5px; right: 8px; z-index: 2; display: flex; align-items: center; line-height: 0; color: var(--ftu-primary); cursor: default; }
  .premium-badge svg { width: 16px; height: 16px; fill: currentColor; }

  /* Load more: a small, neutral (near-black) button tucked into the lower right,
     echoing the player cards (white, hairline border, soft shadow). */
  .more { display: flex; justify-content: flex-end; padding: 10px 0 16px; }
  .loadmore { font-family: inherit; font-size: 12px; font-weight: 600; color: var(--ftu-secondary); background: #fff; border: 1px solid #ededed; border-radius: 10px; padding: 7px 16px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.04); transition: background-color .15s ease, border-color .15s ease; }
  .loadmore:hover { background: #f6f6f7; border-color: #dcdcdc; }
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
    --wave-transition-duration: 480ms;
    flex: 1; min-width: 60px; height: 2.75rem;
    display: flex; align-items: center; justify-content: space-between;
    column-gap: 1px; position: relative; overflow: hidden; cursor: pointer; touch-action: none;
  }
  .ftu-wave-bar { display: block; width: 100%; min-height: 2px; border-radius: 1px; background: var(--wave-bg-base); transition: background-color var(--wave-transition-duration) ease; }
  .ftu-wave-bar[data-played="true"] { background-color: var(--wave-bg-played); }
  @media (pointer: fine) {
    .ftu-wave-bar:hover:not([data-played="true"]),
    .ftu-wave-bar:has(~ .ftu-wave-bar:hover ~ .ftu-wave-bar[data-played="true"]),
    .ftu-wave-bar:has(~ .ftu-wave-bar:hover):not(:has(~ .ftu-wave-bar[data-played="true"])) {
      background: var(--wave-bg-played) !important;
      transition: none !important;
    }
  }

  .dur { flex: none; font-size: 9px; font-weight: 400; color: #8a8a8a; background: #f4f4f6; border-radius: 6px; padding: 3px 7px; font-variant-numeric: tabular-nums; }
  .dl { flex: none; width: 34px; height: 34px; margin: 0 4px; border: none; background: none; color: #9a9a9a; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
  .dl svg { width: 22px; height: 22px; fill: currentColor; }
  .dl:hover { color: var(--ftu-primary-hover); }
`;

const BODY = `
  <div class="head" id="head">Free To Use</div>
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
