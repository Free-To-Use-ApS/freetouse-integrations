import { readFileSync } from "node:fs";

// Static shell + styling for the results widget — a list of Free To Use
// mini-players matching freetouse.com (cover, title/artist, tags, play,
// waveform scrubber, duration, download). Interactive logic lives in
// widget-client.ts (bundled by esbuild to dist/widget-client.js, inlined below).
// The .ftu-wave / .ftu-wave-bar rules mirror packages/ftu-style waveform.css.
const FONT_LINKS =
  '<link rel="preconnect" href="https://fonts.googleapis.com" />' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />' +
  '<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />';

const CSS = `
  :root {
    --ftu-primary: #7569de;
    --ftu-primary-hover: #635ecc;
    --ftu-light-grey: #d1d1d1;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .head { font-size: 13px; color: #8a8a8a; font-weight: 600; padding: 8px 4px 10px; }
  .list { display: flex; flex-direction: column; gap: 10px; }

  .player {
    display: flex; align-items: center; gap: 14px;
    background: #fff; border: 1px solid #ededed; border-radius: 16px;
    padding: 10px 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04);
  }
  .cover { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; background: #f1f1f1; flex: none; }

  .meta { width: 150px; flex: none; min-width: 0; }
  .title { font-weight: 700; font-size: 14px; color: #1d1d1f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .artist { font-size: 12px; color: #9a9a9a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
  .tags { display: flex; gap: 5px; margin-top: 6px; flex-wrap: wrap; }
  .tag { font-size: 10px; font-weight: 600; color: #7a7a7a; background: #f1f1f3; border-radius: 999px; padding: 3px 8px; line-height: 1; white-space: nowrap; }

  .play { flex: none; width: 34px; height: 34px; border-radius: 999px; border: none; background: #efeff1; color: #3a3a3a; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
  .play svg { width: 15px; height: 15px; fill: currentColor; }
  .play.playing { background: var(--ftu-primary); color: #fff; }
  .play:hover { filter: brightness(0.97); }

  /* Waveform (mirrors @freetouse/style waveform.css) */
  .ftu-wave {
    --wave-bg-base: var(--ftu-light-grey);
    --wave-bg-played: var(--ftu-primary);
    --wave-transition-duration: 450ms;
    flex: 1; min-width: 60px; height: 2.75rem;
    display: flex; align-items: flex-end; justify-content: space-between;
    column-gap: 1px; position: relative; overflow: hidden; cursor: pointer; touch-action: none;
  }
  .ftu-wave-bar { display: block; width: 100%; min-height: 1px; background: var(--wave-bg-base); transition: background-color var(--wave-transition-duration) ease; }
  .ftu-wave-bar[data-played="true"] { background-color: var(--wave-bg-played); }
  @media (pointer: fine) {
    .ftu-wave-bar:hover:not([data-played="true"]),
    .ftu-wave-bar:has(~ .ftu-wave-bar:hover ~ .ftu-wave-bar[data-played="true"]),
    .ftu-wave-bar:has(~ .ftu-wave-bar:hover):not(:has(~ .ftu-wave-bar[data-played="true"])) {
      background: var(--wave-bg-played) !important;
      transition: none !important;
    }
  }

  .dur { flex: none; font-size: 12px; font-weight: 600; color: #9a9a9a; min-width: 32px; text-align: right; font-variant-numeric: tabular-nums; }
  .dl { flex: none; width: 30px; height: 30px; border: none; background: none; color: #9a9a9a; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
  .dl svg { width: 20px; height: 20px; }
  .dl:hover { color: var(--ftu-primary-hover); }
`;

const BODY = `
  <div class="head" id="head">Free To Use</div>
  <div class="list" id="list"></div>
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
    FONT_LINKS +
    `<style>${CSS}</style></head><body>${BODY}<script>${js}</script></body></html>`
  );
}
