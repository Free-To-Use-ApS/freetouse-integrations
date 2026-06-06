import { readFileSync } from "node:fs";

// Static shell + styling for the results widget. Interactive logic lives in
// widget-client.ts (bundled by esbuild to dist/widget-client.js and inlined
// below at startup). The client renders track rows into #list.
const CSS = `
  :root { color-scheme: light dark; --row:#0000000d; --accent:#5b5bd6; }
  @media (prefers-color-scheme: dark){ :root{ --row:#ffffff14; } }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .head { font-size: 13px; opacity: .65; padding: 12px 14px 6px; }
  .list { display: flex; flex-direction: column; gap: 6px; padding: 0 10px 12px; }
  .row { display: flex; gap: 12px; align-items: center; padding: 8px; border-radius: 12px; }
  .row:hover { background: var(--row); }
  .row.active { background: var(--row); }
  .cover { width: 52px; height: 52px; border-radius: 9px; object-fit: cover; background: #8881; flex: none; }
  .info { flex: 1; min-width: 0; }
  .title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 12px; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  .desc { font-size: 12px; opacity: .8; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tags { display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap; }
  .tag { font-size: 10px; line-height: 1; padding: 4px 7px; border-radius: 999px; background: var(--row); opacity: .85; }
  .right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
  .play { width: 36px; height: 36px; border-radius: 999px; border: none; background: var(--accent); color: #fff; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .play:active { transform: scale(.95); }
  .dur { font-size: 11px; opacity: .5; }
  .link { font-size: 11px; color: var(--accent); text-decoration: none; }
  .link:hover { text-decoration: underline; }
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
    `<style>${CSS}</style></head><body>${BODY}<script>${js}</script></body></html>`
  );
}
