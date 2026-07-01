// Client-side logic for the results widget. Bundled by esbuild into a browser
// IIFE and inlined into the widget HTML. Renders a list of Free To Use
// mini-players (cover, title/artist, tags, play, waveform scrubber, duration,
// download) and plays any of them inline via one shared <audio>.
//
// Track data arrives via whichever host bridge is present:
//   1. window.openai.toolOutput   — ChatGPT Apps SDK (synchronous)
//   2. ext-apps App.ontoolresult  — cross-host MCP Apps standard (async)
//   3. an embedded fallback list  — so the widget always renders (/preview)
//
// Downloads go through the host (App.downloadFile) since sandboxed iframes block
// direct cross-origin downloads.
import { App } from "@modelcontextprotocol/ext-apps";

interface UiTrack {
  id?: string;
  title?: string;
  artist?: string;
  duration?: number;
  mp3?: string;
  art?: string;
  url?: string;
  artistUrl?: string;
  tags?: string[];
  genre?: string | null;
  description?: string;
  gain?: number;
  // number[] in /preview & MCP-UI; a compact base64 string from the server (decoded
  // client-side) so the raw 80-int array doesn't bloat the model's context.
  peaks?: number[] | string;
  chips?: { label: string; href: string }[];
  premium?: boolean;
}

interface ResultData {
  heading?: string;
  tracks?: UiTrack[];
  offset?: number;
  limit?: number;
  total?: number;
  /** Active sort (drives the dropdown). null/absent = no sort dropdown. */
  sort?: string | null;
  more?: { tool: string; args: Record<string, unknown> } | null;
}

interface RowState {
  track: UiTrack;
  el: any;
  bars: any[];
  wave: any; // the .ftu-wave scrubber (role=slider) — aria-valuenow updated on progress
  durEl: any;
  playBtn: any;
  idx: number; // index of last "played" bar (-1 = none)
  resumeTime: number; // audio currentTime (s) to resume from when replayed
  completed: boolean; // played through to the end (replays from the start)
}

// Free To Use brand play/pause buttons (full circle + glyph baked in): grey
// circle when idle (play), purple circle when playing (pause).
const PLAY =
  '<svg viewBox="0 0 55 55" xmlns="http://www.w3.org/2000/svg"><path fill-rule="nonzero" fill="#969696" d="M27.5,0 C12.3355762,0 0,12.3367578 0,27.5 C0,42.6632422 12.3355762,55 27.5,55 C42.6644238,55 55,42.6632422 55,27.5 C55,12.3367578 42.6644238,0 27.5,0 Z M38.4324316,28.4634668 L22.3908008,38.7759668 C22.2060559,38.8952459 21.990774,38.9583697 21.7708691,38.9583697 C21.5828809,38.9583697 21.3926367,38.9113184 21.2225879,38.8185059 C20.8532715,38.6170898 20.625,38.2320898 20.625,37.8125 L20.625,17.1875 C20.625,16.7679102 20.8532715,16.3829102 21.2225879,16.1814941 C21.5851367,15.982334 22.0394238,15.9945801 22.3908008,16.2240332 L38.4324316,26.5365332 C38.759209,26.7468652 38.9583691,27.1105957 38.9583691,27.5 C38.9583691,27.8894043 38.759209,28.2530273 38.4324316,28.4634668 Z"></path></svg>';
const PAUSE =
  '<svg viewBox="0 0 55 55" xmlns="http://www.w3.org/2000/svg"><path fill-rule="nonzero" fill="#7569DE" d="M27.5,0 C12.30625,0 0,12.30625 0,27.5 C0,42.69375 12.30625,55 27.5,55 C42.69375,55 55,42.69375 55,27.5 C55,12.30625 42.69375,0 27.5,0 Z M24.475,34.375 C24.475,36.09375 23.1,37.4 21.45,37.4 C19.73125,37.4 18.425,36.025 18.425,34.375 L18.425,20.625 C18.35625,18.975 19.73125,17.6 21.38125,17.6 C23.1,17.6 24.475,18.975 24.475,20.625 L24.475,34.375 Z M36.64375,34.375 C36.64375,36.09375 35.26875,37.4 33.61875,37.4 C31.9,37.4 30.59375,36.025 30.59375,34.375 L30.59375,20.625 C30.525,18.975 31.9,17.6 33.55,17.6 C35.26875,17.6 36.64375,18.975 36.64375,20.625 L36.64375,34.375 Z"></path></svg>';
// Bootstrap Icons "download" (tray + down arrow): icons.getbootstrap.com/icons/download
const DL =
  '<svg viewBox="0 0 16 16">' +
  '<path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"></path>' +
  '<path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"></path>' +
  "</svg>";
// Bootstrap Icons "bookmark-star-fill" — premium indicator (matches freetouse.com).
const PREMIUM =
  '<svg viewBox="0 0 16 16">' +
  '<path fill-rule="evenodd" d="M2 15.5V2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.74.439L8 13.069l-5.26 2.87A.5.5 0 0 1 2 15.5M8.16 4.1a.178.178 0 0 0-.32 0l-.634 1.285a.18.18 0 0 1-.134.098l-1.42.206a.178.178 0 0 0-.098.303L6.58 7.286a.18.18 0 0 1 .051.158L6.3 8.858a.178.178 0 0 0 .258.187l1.27-.668a.18.18 0 0 1 .165 0l1.27.668a.178.178 0 0 0 .257-.187L9.27 7.444a.18.18 0 0 1 .05-.158l1.028-1.001a.178.178 0 0 0-.098-.303l-1.42-.206a.18.18 0 0 1-.134-.098z"></path>' +
  "</svg>";
// Bootstrap Icons "bag" — the "Get a license" action. Links to the track's
// freetouse.com licensing page. icons.getbootstrap.com/icons/bag
const BAG =
  '<svg viewBox="0 0 16 16">' +
  '<path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1m3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4zM2 5h12v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"></path>' +
  "</svg>";
// Attribution-modal glyphs (close, copy, copied-check).
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
const COPY_ICON =
  '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

const DEFAULT_PEAKS: number[] = Array.from({ length: 80 }, (_v, i) =>
  22 + Math.round(45 * Math.abs(Math.sin(i / 3.5))),
);

// Waveform bars arrive as a base64 string of 0-100 bytes from the server (kept
// compact so they don't bloat the model context) or as a raw number[] in preview.
function decodePeaks(p: number[] | string | undefined): number[] {
  if (Array.isArray(p)) return p;
  if (typeof p === "string" && p.length) {
    try {
      const bin = atob(p);
      const out: number[] = [];
      for (let i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i));
      return out;
    } catch (_e) {
      return [];
    }
  }
  return [];
}

// Waveform fill colours (mirror the CSS --ftu vars). As the playhead crosses each
// bar we fade it from grey to purple via the Web Animations API rather than rely
// solely on the CSS transition — some host iframes freeze/strip CSS transitions,
// so driving the fade in JS makes the "fills in bar by bar" effect reliable.
const WAVE_BASE = "#d1d1d1";
const WAVE_BASE_DARK = "#4b4b54";
const WAVE_PLAYED = "#7569de";
const WAVE_FADE_MS = 480;
// The grey a bar fades FROM — mirrors CSS --ftu-light-grey, swapped by applyTheme()
// so the animated fade starts at the right resting colour in either theme.
let waveBase = WAVE_BASE;

const FALLBACK: ResultData = {
  heading: 'Free To Use — 1 result for "lofi"',
  offset: 0,
  limit: 20,
  total: 1,
  sort: "relevance",
  more: { tool: "search_music", args: { query: "lofi", limit: 20, sort: "relevance" } },
  tracks: [
    {
      title: "remedy",
      artist: "massobeats",
      genre: "Instrumental",
      duration: 107.75,
      mp3: "https://data.freetouse.com/music/tracks/4a5a2691-46b7-4624-a1f7-d83914f65c74/file/mp3/file.mp3",
      art: "https://data.freetouse.com/music/tracks/4a5a2691-46b7-4624-a1f7-d83914f65c74/cover/webp/md/cover-md.webp",
      url: "https://freetouse.com/music/massobeats/remedy",
      artistUrl: "https://freetouse.com/music/massobeats",
      tags: ["chillhop", "dreamy"],
      chips: [
        { label: "Lofi", href: "https://freetouse.com/music/category/lofi" },
        { label: "Chillhop", href: "https://freetouse.com/music/search/chillhop" },
      ],
      description: "Aesthetic Lofi track with chillhop, dreamy vibes.",
      gain: 0.8,
      peaks: DEFAULT_PEAKS,
      premium: false,
    },
  ],
};

const audioEl = (): any => document.getElementById("audio");

function fmt(sec?: number): string {
  if (sec == null || isNaN(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

let appInstance: any = null;
// True only once the MCP Apps standard handshake actually completes — so we don't
// call host-mediated methods (openLink) on an unconnected App (e.g. in /preview).
let appConnected = false;
let rows: RowState[] = [];
let active: RowState | null = null;
let pendingSeek: number | null = null;
// currentTime (s) to seek to once the next track's metadata loads (resume point).
let pendingResume: number | null = null;
let rendered = false;
let audioWired = false;

// Pagination state for "Load more".
let curMore: { tool: string; args: Record<string, unknown> } | null = null;
let curTotal = 0;
let renderedCount = 0;
let loadingMore = false;
// Bumped on every fresh render so an in-flight Load more can detect that the
// widget was re-rendered (e.g. a new tool result) and abandon its stale result.
let gen = 0;

// --- waveform fill ----------------------------------------------------------

// Mark a bar played (purple, fading in) or unplayed (grey). The fade is driven by
// the Web Animations API so it animates even where CSS transitions are frozen;
// the [data-played] CSS rule still defines the resting colour after the fade.
function paintBar(bar: any, played: boolean, animate: boolean): void {
  if (!played) {
    bar.dataset.played = "";
    // Cancel any in-flight fade so a rewound bar reverts to grey immediately
    // instead of finishing its grey->purple animation.
    try { bar.getAnimations().forEach((a: any) => a.cancel()); } catch (_e) {}
    return;
  }
  if (bar.dataset.played === "true") return;
  bar.dataset.played = "true";
  // Fade in only as the playhead crosses a bar during playback. A manual seek
  // (animate=false) jumps straight to the played colour — no fade, so it can't
  // flicker against the instant hover-preview highlight.
  if (!animate) return;
  try {
    bar.animate(
      [{ backgroundColor: waveBase }, { backgroundColor: WAVE_PLAYED }],
      { duration: WAVE_FADE_MS, easing: "ease" },
    );
  } catch (_e) {
    /* WAAPI unsupported — the data-played CSS rule still shows the played colour. */
  }
}

function setProgress(state: RowState, frac: number, animate: boolean): void {
  const n = state.bars.length;
  // Keep the slider's reported value in sync for assistive tech.
  if (state.wave) {
    state.wave.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(1, frac)) * 100)));
    const dur = state.track.duration || 0;
    if (dur) state.wave.setAttribute("aria-valuetext", `${fmt(frac * dur)} of ${fmt(dur)}`);
  }
  let idx = Math.floor(frac * n);
  if (idx >= n) idx = n - 1;
  if (idx < -1) idx = -1;
  if (idx === state.idx) return;
  if (idx > state.idx) {
    for (let i = state.idx + 1; i <= idx; i++) paintBar(state.bars[i], true, animate);
  } else {
    for (let i = state.idx; i > idx; i--) paintBar(state.bars[i], false, animate);
  }
  state.idx = idx;
}

function resetRow(state: RowState): void {
  for (let i = 0; i <= state.idx; i++) {
    const b = state.bars[i];
    b.dataset.played = "";
    // Stop any in-flight fade so the bar snaps cleanly back to grey.
    try { b.getAnimations().forEach((a: any) => a.cancel()); } catch (_e) {}
  }
  state.idx = -1;
  state.durEl.textContent = fmt(state.track.duration);
  if (state.wave) {
    state.wave.setAttribute("aria-valuenow", "0");
    state.wave.removeAttribute("aria-valuetext");
  }
}

// Mark a whole row played (every bar purple) — used when a track finishes so it
// stays filled, showing the user they've already listened to it.
function fillAll(state: RowState): void {
  for (let i = 0; i < state.bars.length; i++) state.bars[i].dataset.played = "true";
  state.idx = state.bars.length - 1;
  if (state.wave) {
    state.wave.setAttribute("aria-valuenow", "100");
    const dur = state.track.duration || 0;
    if (dur) state.wave.setAttribute("aria-valuetext", `${fmt(dur)} of ${fmt(dur)}`);
    else state.wave.removeAttribute("aria-valuetext");
  }
}

function setRowPlaying(state: RowState, playing: boolean): void {
  state.playBtn.innerHTML = playing ? PAUSE : PLAY;
  state.playBtn.classList.toggle("playing", playing);
  state.el.classList.toggle("active", playing);
}

// --- playback ---------------------------------------------------------------

function wireAudioOnce(): void {
  if (audioWired) return;
  audioWired = true;
  const a = audioEl();
  a.addEventListener("play", () => { if (active) setRowPlaying(active, true); });
  a.addEventListener("pause", () => {
    if (!active) return;
    // Remember where we paused so this track can resume there if replayed later.
    if (isFinite(a.currentTime) && a.currentTime > 0) active.resumeTime = a.currentTime;
    setRowPlaying(active, false);
  });
  a.addEventListener("ended", () => {
    const cur = active;
    if (!cur) return;
    setRowPlaying(cur, false);
    // Keep the bars filled so the user sees this track was played; replay starts
    // from the beginning (handled in playTrack via the `completed` flag).
    fillAll(cur);
    cur.completed = true;
    cur.resumeTime = 0;
    // Auto-advance to the next track in the batch (if any), always from its
    // start — resume only applies to an explicit play press, so clear any prior
    // resume point / leftover fill the next track may carry.
    const idx = rows.indexOf(cur);
    active = null;
    const next = idx >= 0 ? rows[idx + 1] : null;
    if (next) {
      resetRow(next);
      next.resumeTime = 0;
      next.completed = false;
      playTrack(next);
    }
  });
  a.addEventListener("loadedmetadata", () => {
    if (!active || !a.duration) return;
    // A click-to-seek position takes priority over a resume point.
    if (pendingSeek != null) {
      a.currentTime = pendingSeek * a.duration;
      pendingSeek = null;
      pendingResume = null;
    } else if (pendingResume != null) {
      a.currentTime = Math.min(pendingResume, a.duration);
      pendingResume = null;
    }
  });
  a.addEventListener("timeupdate", () => {
    if (active && a.duration) setProgress(active, a.currentTime / a.duration, true);
  });
}

function playTrack(state: RowState): void {
  const a = audioEl();
  if (active === state) {
    if (a.paused) a.play().catch(() => {});
    else a.pause();
    return;
  }
  // Leaving the current track: remember its position and KEEP its fill purple, so
  // the user can see what they've played and resume it later.
  if (active) {
    if (isFinite(a.currentTime) && a.currentTime > 0) active.resumeTime = a.currentTime;
    setRowPlaying(active, false);
  }
  active = state;
  pendingSeek = null;
  // A finished track replays from the start (clear its fill); otherwise resume
  // from where it last left off once the new track's metadata loads.
  if (state.completed) {
    resetRow(state);
    state.completed = false;
    state.resumeTime = 0;
  }
  pendingResume = state.resumeTime > 0 ? state.resumeTime : null;
  a.src = state.track.mp3 || "";
  a.volume = typeof state.track.gain === "number" ? state.track.gain : 1;
  a.play().catch(() => {});
}

function fractionFromX(el: any, clientX: number): number {
  const rect = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const pl = parseFloat(s.paddingLeft) || 0;
  const pr = parseFloat(s.paddingRight) || 0;
  const innerLeft = rect.left + pl;
  const innerWidth = rect.width - pl - pr;
  if (innerWidth <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - innerLeft) / innerWidth));
}

function seek(state: RowState, frac: number): void {
  if (active !== state) {
    playTrack(state);
    pendingResume = null; // an explicit click position overrides the resume point
    pendingSeek = frac;
    setProgress(state, frac, false);
    return;
  }
  const a = audioEl();
  if (a.duration) {
    a.currentTime = frac * a.duration;
    setProgress(state, frac, false);
  } else {
    pendingSeek = frac;
    setProgress(state, frac, false);
  }
  // Clicking the scrubber resumes playback if the track was paused.
  if (a.paused) a.play().catch(() => {});
}

// --- download (host-mediated) ----------------------------------------------

function download(track: UiTrack): void {
  if (!track.mp3) return;
  const name = `${track.artist || "Free To Use"} - ${track.title || "track"} (freetouse.com).mp3`;
  if (appInstance && appInstance.downloadFile) {
    appInstance
      .downloadFile({ contents: [{ type: "resource_link", uri: track.mp3, name, mimeType: "audio/mpeg" }] })
      .catch(() => fallbackDownload(track));
  } else {
    fallbackDownload(track);
  }
}

function fallbackDownload(track: UiTrack): void {
  try {
    window.open(track.mp3 || track.url || "", "_blank");
  } catch (_e) {
    /* ignore */
  }
}

// --- attribution modal (shown after an in-app download) --------------------

// Free To Use is free to use with credit. Because the download happens INSIDE the
// app here (not on the track page), pop the same attribution reminder the other
// FTU apps show, so the user has the credit text to hand. Built client-side from
// title+artist (matches the server's attribution format) — no extra payload.
let attrBackdrop: any = null;
let attrModal: any = null;

function copyText(text: string): Promise<boolean> {
  try {
    const c: any = (navigator as any).clipboard;
    if (c && c.writeText) return c.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  } catch (_e) {}
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (_e) {
    return false;
  }
}

function closeAttribution(): void {
  if (attrBackdrop) { try { attrBackdrop.remove(); } catch (_e) {} attrBackdrop = null; }
  if (attrModal) { try { attrModal.remove(); } catch (_e) {} attrModal = null; }
  document.body.classList.remove("modal-open");
  document.removeEventListener("keydown", onAttrKey);
}

function onAttrKey(e: any): void {
  if (e.key === "Escape") closeAttribution();
}

function showAttribution(track: UiTrack, anchor?: any): void {
  closeAttribution();
  const title = track.title || "This track";
  const artist = track.artist || "Free To Use";
  // Cite this exact track's page when we have it (freetouse.com's own attribution
  // format), falling back to the generic music hub for the demo/fallback track.
  const source = track.url || "https://freetouse.com/music";
  const lines = [`Music track: ${title} by ${artist}`, `Source: ${source}`];

  const backdrop = document.createElement("div");
  backdrop.className = "attr-backdrop";
  backdrop.addEventListener("click", closeAttribution);

  const modal = document.createElement("div");
  modal.className = "attr-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Attribution is required");

  const head = document.createElement("div");
  head.className = "attr-head";
  const h = document.createElement("span");
  h.className = "attr-title";
  h.textContent = "Attribution is required";
  const close = document.createElement("button");
  close.className = "attr-close";
  close.setAttribute("aria-label", "Close");
  close.innerHTML = CLOSE_ICON;
  close.addEventListener("click", closeAttribution);
  head.appendChild(h);
  head.appendChild(close);

  const desc = document.createElement("p");
  desc.className = "attr-desc";
  const em = document.createElement("em");
  em.textContent = `${title} by ${artist}`;
  desc.appendChild(em);
  desc.appendChild(
    document.createTextNode(
      " is free to use in non-commercial content as long as you provide attribution in your video description.",
    ),
  );

  const box = document.createElement("div");
  box.className = "attr-box";
  const linesEl = document.createElement("div");
  linesEl.className = "attr-lines";
  lines.forEach((l) => {
    const s = document.createElement("span");
    s.className = "attr-line";
    s.textContent = l;
    linesEl.appendChild(s);
  });
  const copy = document.createElement("button");
  copy.className = "attr-copy";
  copy.title = "Copy";
  copy.setAttribute("aria-label", "Copy attribution");
  copy.innerHTML = COPY_ICON;
  copy.addEventListener("click", () => {
    copyText(lines.join("\n")).then((ok) => {
      if (!ok) return;
      copy.classList.add("copied");
      copy.innerHTML = CHECK_ICON;
      setTimeout(() => {
        copy.classList.remove("copied");
        copy.innerHTML = COPY_ICON;
      }, 2000);
    });
  });
  box.appendChild(linesEl);
  box.appendChild(copy);

  modal.appendChild(head);
  modal.appendChild(desc);
  modal.appendChild(box);

  // Anchor the modal to the row that was just downloaded, so it shows where the
  // user clicked instead of centered in a (possibly very tall) widget.
  let top = 16;
  try {
    if (anchor && anchor.getBoundingClientRect) {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      top = Math.max(8, anchor.getBoundingClientRect().top + scrollTop);
    }
  } catch (_e) {}
  modal.style.top = top + "px";

  // Backdrop and modal are siblings on <body>: the backdrop dims the viewport,
  // while the modal is absolutely positioned in the document near the track.
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
  attrBackdrop = backdrop;
  attrModal = modal;
  document.addEventListener("keydown", onAttrKey);
  try { close.focus(); } catch (_e) {}
}

// --- external links (host-mediated) ----------------------------------------

// Open a freetouse.com page (track/artist/category/search). Sandboxed host
// iframes block plain target=_blank, so route through the host's link API when
// present (ChatGPT's window.openai.openExternal, or the MCP Apps standard
// App.openLink), falling back to window.open for the /preview route.
function openHref(href?: string): void {
  if (!href) return;
  const oa: any = (window as any).openai;
  if (oa && typeof oa.openExternal === "function") {
    try { oa.openExternal({ href }); return; } catch (_e) {}
  }
  if (appConnected && appInstance && typeof appInstance.openLink === "function") {
    try { appInstance.openLink({ url: href }).catch(() => winOpen(href)); return; } catch (_e) {}
  }
  winOpen(href);
}

function winOpen(href: string): void {
  try { window.open(href, "_blank", "noopener,noreferrer"); } catch (_e) {}
}

// Wire an element to open a freetouse.com link on click or keyboard activation,
// and expose it to assistive tech as a link (cursor handled in CSS).
function linkTo(el: any, href?: string, label?: string): void {
  if (!href) return;
  el.setAttribute("role", "link");
  el.setAttribute("tabindex", "0");
  if (label) el.setAttribute("aria-label", label);
  const go = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    openHref(href);
  };
  el.addEventListener("click", go);
  el.addEventListener("keydown", (e: any) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") go(e);
  });
}

// --- theme ------------------------------------------------------------------

// Follow the host's colour scheme, in priority order:
//   1. ChatGPT Apps SDK — window.openai.theme ("light"/"dark"), re-broadcast via
//      openai:set_globals.
//   2. MCP Apps standard host — App.getHostContext().theme, re-broadcast via the
//      "hostcontextchanged" event (only available once connect() resolves).
//   3. OS preference — prefers-color-scheme (covers /preview and hosts that don't
//      report a theme).
// We set data-theme="dark" on <html> (the CSS switches all tokens) and swap the
// waveform fade's start colour so the JS-driven grey->purple animation starts at
// the right resting grey.
function detectTheme(): "light" | "dark" {
  const oa: any = (window as any).openai;
  const ot = oa && (oa.theme || (oa.globals && oa.globals.theme));
  if (ot === "dark" || ot === "light") return ot;
  try {
    const ht = appInstance && appInstance.getHostContext && appInstance.getHostContext();
    if (ht && (ht.theme === "dark" || ht.theme === "light")) return ht.theme;
  } catch (_e) {}
  try {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch (_e) {}
  return "light";
}

function applyTheme(): void {
  const dark = detectTheme() === "dark";
  const root = document.documentElement;
  if (dark) root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  waveBase = dark ? WAVE_BASE_DARK : WAVE_BASE;
}

// --- rendering --------------------------------------------------------------

function buildRow(track: UiTrack): RowState {
  const el = document.createElement("div");
  el.className = "player";

  // Cover art links to the track page on freetouse.com.
  const cover = document.createElement("img");
  cover.className = "cover";
  cover.alt = track.title ? `${track.title} cover art` : "";
  if (track.art) cover.src = track.art;
  if (track.url) {
    cover.classList.add("lnk");
    cover.title = track.title || "";
    linkTo(cover, track.url, `Open ${track.title || "track"} on Free To Use`);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  // Title -> track page; artist -> artist page.
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = track.title || "Untitled";
  if (track.url) {
    title.classList.add("lnk");
    linkTo(title, track.url, `${track.title || "Track"} — open track page`);
  }
  const artist = document.createElement("div");
  artist.className = "artist";
  artist.textContent = track.artist || "";
  if (track.artistUrl) {
    artist.classList.add("lnk");
    linkTo(artist, track.artistUrl, `${track.artist || "Artist"} — open artist page`);
  }
  meta.appendChild(title);
  meta.appendChild(artist);

  // First two tags/categories as pills (like freetouse.com), in their own column.
  // Each pill links to its freetouse.com page (category page or tag search).
  const chipList = (track.chips && track.chips.length
    ? track.chips
    : (track.tags || []).map((t) => ({ label: t, href: "" }))
  ).slice(0, 2);
  let chipsEl: any = null;
  if (chipList.length) {
    chipsEl = document.createElement("div");
    chipsEl.className = "chips";
    chipList.forEach((c) => {
      const s = document.createElement("span");
      s.className = "chip";
      s.textContent = c.label;
      if (c.href) { s.classList.add("lnk"); linkTo(s, c.href, `${c.label} — browse on Free To Use`); }
      chipsEl.appendChild(s);
    });
  }

  const playBtn = document.createElement("button");
  playBtn.className = "play";
  playBtn.innerHTML = PLAY;
  playBtn.setAttribute("aria-label", "Play " + (track.title || ""));

  const waveEl = document.createElement("div");
  waveEl.className = "ftu-wave";
  // Expose the scrubber as a keyboard/screen-reader slider.
  waveEl.setAttribute("role", "slider");
  waveEl.setAttribute("tabindex", "0");
  waveEl.setAttribute("aria-label", `Seek ${track.title || "track"}`);
  waveEl.setAttribute("aria-valuemin", "0");
  waveEl.setAttribute("aria-valuemax", "100");
  waveEl.setAttribute("aria-valuenow", "0");
  const decoded = decodePeaks(track.peaks);
  const peaks = decoded.length ? decoded : DEFAULT_PEAKS;
  const bars: any[] = [];
  peaks.forEach((v) => {
    const b = document.createElement("span");
    b.className = "ftu-wave-bar";
    b.style.height = Math.max(6, Math.min(100, v)) + "%";
    waveEl.appendChild(b);
    bars.push(b);
  });

  const durEl = document.createElement("div");
  durEl.className = "dur";
  durEl.textContent = fmt(track.duration);

  // "Get a license" bag — opens this track's freetouse.com licensing page (for
  // commercial / no-attribution use). Shown for every track that has a page.
  const licenseUrl = track.url ? track.url.replace(/\/+$/, "") + "/license" : "";
  let licenseBtn: any = null;
  if (licenseUrl) {
    licenseBtn = document.createElement("button");
    licenseBtn.className = "license";
    licenseBtn.innerHTML = BAG;
    licenseBtn.title = "Get a license";
    licenseBtn.setAttribute("aria-label", "Get a license for " + (track.title || "this track"));
    licenseBtn.addEventListener("click", (e: any) => {
      e.stopPropagation();
      openHref(licenseUrl);
    });
  }

  const dlBtn = document.createElement("button");
  dlBtn.className = "dl";
  dlBtn.innerHTML = DL;
  dlBtn.setAttribute("aria-label", "Download " + (track.title || ""));

  const vdiv = () => {
    const d = document.createElement("div");
    d.className = "vdiv";
    return d;
  };
  // Cover sits flush against the card's left edge (no divider after it). Every-
  // thing else lives in a padded body: meta | chips | play | wave | dur | license | dl,
  // with dividers around the chips and before the license/download action pair.
  const body = document.createElement("div");
  body.className = "body";
  body.appendChild(meta);
  if (chipsEl) {
    body.appendChild(vdiv());
    body.appendChild(chipsEl);
  }
  body.appendChild(vdiv());
  body.appendChild(playBtn);
  body.appendChild(waveEl);
  body.appendChild(durEl);
  body.appendChild(vdiv());
  if (licenseBtn) body.appendChild(licenseBtn);
  body.appendChild(dlBtn);
  // The framed/clipped card. The badge lives outside it (directly on .player) so
  // it can poke slightly above the top edge without being clipped.
  const clip = document.createElement("div");
  clip.className = "player-clip";
  clip.appendChild(cover);
  clip.appendChild(body);
  el.appendChild(clip);
  // Premium tracks get a bookmark-star in the card's upper-right corner, poking
  // slightly above the frame (matching freetouse.com). It's purely a visual flag;
  // the licensing action lives on the row's "Get a license" bag button.
  if (track.premium) {
    const star = document.createElement("span");
    star.className = "premium-badge";
    star.innerHTML = PREMIUM;
    star.title = "Premium track";
    star.setAttribute("aria-label", "Premium track");
    el.appendChild(star);
  }

  const state: RowState = { track, el, bars, wave: waveEl, durEl, playBtn, idx: -1, resumeTime: 0, completed: false };

  playBtn.addEventListener("click", () => playTrack(state));
  // Download, then show the attribution reminder (the download happens in-app here,
  // so the user gets the credit text without visiting the track page).
  dlBtn.addEventListener("click", () => {
    download(track);
    showAttribution(track, el);
  });

  // Click + drag to scrub (pointer capture so dragging works off the bar).
  let dragging = false;
  waveEl.addEventListener("pointerdown", (e: any) => {
    dragging = true;
    try { waveEl.setPointerCapture(e.pointerId); } catch (_e) {}
    seek(state, fractionFromX(waveEl, e.clientX));
    e.preventDefault();
  });
  waveEl.addEventListener("pointermove", (e: any) => {
    if (dragging) seek(state, fractionFromX(waveEl, e.clientX));
  });
  const stop = (e: any) => {
    dragging = false;
    try { waveEl.releasePointerCapture(e.pointerId); } catch (_e) {}
  };
  waveEl.addEventListener("pointerup", stop);
  waveEl.addEventListener("pointercancel", stop);

  // Keyboard scrubbing: arrows seek +/-5%, Home/End jump to ends, Space toggles play.
  waveEl.addEventListener("keydown", (e: any) => {
    const a = audioEl();
    const cur =
      active === state && a.duration ? a.currentTime / a.duration : (state.idx + 1) / state.bars.length;
    let handled = true;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") seek(state, Math.min(1, cur + 0.05));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") seek(state, Math.max(0, cur - 0.05));
    else if (e.key === "Home") seek(state, 0);
    else if (e.key === "End") seek(state, 0.999);
    else if (e.key === " " || e.key === "Spacebar" || e.key === "Enter") playTrack(state);
    else handled = false;
    if (handled) e.preventDefault();
  });

  return state;
}

function appendRows(tracks: UiTrack[]): void {
  const list = document.getElementById("list");
  if (!list) return;
  tracks.forEach((t) => {
    const st = buildRow(t);
    rows.push(st);
    list.appendChild(st.el);
  });
}

function renderLoadMore(): void {
  const moreEl = document.getElementById("more");
  if (!moreEl) return;
  moreEl.textContent = "";
  if (!curMore || renderedCount >= curTotal) return;
  const btn = document.createElement("button");
  btn.className = "loadmore";
  btn.textContent = loadingMore ? "Loading…" : "Load more";
  btn.disabled = loadingMore;
  btn.addEventListener("click", loadMore);
  moreEl.appendChild(btn);
}

// --- sort dropdown ----------------------------------------------------------

const SORT_LABELS: Record<string, string> = {
  relevance: "Best match",
  staff: "Staff picks",
  popular: "Popular",
  newest: "Newest",
  undiscovered: "Undiscovered",
};

// Search offers "Best match" (relevance) on top of the shared options — but only
// when there's an actual query (a curated/empty search has nothing to rank, so it
// defaults to staff). Browse tools just get the four freetouse.com sorts.
function sortOptionsFor(tool?: string, hasQuery?: boolean): string[] {
  const base = ["staff", "popular", "newest", "undiscovered"];
  return tool === "search_music" && hasQuery ? ["relevance", ...base] : base;
}

let sortWired = false;
// Populate + show the sort <select> for the current result, or hide it when the
// result carries no sort (e.g. find_similar).
function configureSort(data: ResultData | null | undefined): void {
  const sel: any = document.getElementById("sort");
  if (!sel) return;
  const headRow: any = sel.parentElement; // the .head-row (hidden when sort is)
  const tool = data && data.more && data.more.tool;
  const sort = data && data.sort;
  const total = data && typeof data.total === "number" ? data.total : (data && data.tracks ? data.tracks.length : 0);
  // Nothing worth sorting with 0-1 results, or no sort (find_similar).
  if (!sort || !tool || total <= 1) {
    sel.classList.add("hidden");
    if (headRow) headRow.classList.add("hidden");
    return;
  }
  if (headRow) headRow.classList.remove("hidden");
  const args: any = (data && data.more && data.more.args) || {};
  const hasQuery = typeof args.query === "string" && args.query.trim().length > 0;
  const opts = sortOptionsFor(tool, hasQuery);
  const want = opts.join(",");
  if (sel.dataset.opts !== want) {
    sel.innerHTML = "";
    opts.forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = SORT_LABELS[k] || k;
      sel.appendChild(o);
    });
    sel.dataset.opts = want;
  }
  sel.value = opts.indexOf(sort) >= 0 ? sort : opts[0];
  // Remember the ordering actually applied, so a failed re-fetch can revert the
  // dropdown label instead of lying about the on-screen order.
  sel.dataset.applied = sel.value;
  sel.classList.remove("hidden");
  if (!sortWired) {
    sortWired = true;
    sel.addEventListener("change", onSortChange);
  }
}

// Changing the sort re-fetches the same query/category/artist from offset 0 with
// the new order (the result set is unchanged — only its ordering).
function onSortChange(): void {
  const sel: any = document.getElementById("sort");
  if (!sel || !curMore) return;
  const args = Object.assign({}, curMore.args, { sort: sel.value, offset: 0 });
  sel.disabled = true;
  // Revert the label to the last-applied sort if the re-fetch doesn't render, so
  // the dropdown never shows an order the list isn't actually in.
  const revert = () => { if (sel.dataset.applied) sel.value = sel.dataset.applied; };
  callTool(curMore.tool, args)
    .then((d) => { if (d) render(d); else revert(); })
    .catch(revert)
    .then(() => { sel.disabled = false; });
}

function extractResult(r: any): ResultData | null {
  if (!r) return null;
  if (r.structuredContent) return r.structuredContent;
  if (r.tracks) return r;
  if (r.result && r.result.structuredContent) return r.result.structuredContent;
  return null;
}

function callTool(name: string, args: Record<string, unknown>): Promise<ResultData | null> {
  const oa: any = (window as any).openai;
  if (oa && typeof oa.callTool === "function") {
    return Promise.resolve(oa.callTool(name, args)).then(extractResult);
  }
  if (appInstance && typeof appInstance.callServerTool === "function") {
    return appInstance.callServerTool({ name, arguments: args }).then(extractResult);
  }
  return Promise.reject(new Error("no callTool bridge"));
}

function loadMore(): void {
  if (!curMore || loadingMore) return;
  const myGen = gen;
  loadingMore = true;
  renderLoadMore();
  const args = Object.assign({}, curMore.args, { offset: renderedCount });
  callTool(curMore.tool, args)
    .then((data) => {
      if (myGen !== gen) return; // widget was re-rendered; abandon this stale result
      loadingMore = false;
      if (!data) {
        // Null = error / unrecognized shape: keep curMore so the button stays for a retry.
        renderLoadMore();
        return;
      }
      // Valid response (even an empty end-of-list page): trust its more/total.
      const tracks = data.tracks || [];
      appendRows(tracks);
      renderedCount += tracks.length;
      if (typeof data.total === "number") curTotal = data.total;
      curMore = data.more || null;
      renderLoadMore();
    })
    .catch(() => {
      if (myGen !== gen) return;
      loadingMore = false;
      renderLoadMore();
    });
}

function render(data: ResultData | null | undefined): void {
  // Only wait when there's genuinely no result yet. A present result with an
  // empty tracks list (e.g. a zero-result search, or find_similar not finding the
  // track) is a real answer — render its heading + an empty state, never leave a
  // stale list or placeholder heading on screen.
  if (!data || !data.tracks) return;
  const tracks = data.tracks;
  rendered = true;
  // New render generation: invalidates any in-flight Load more and clears the
  // loading flag so a stale request can't append foreign rows or stick the button.
  gen++;
  loadingMore = false;
  closeAttribution(); // don't leave a download modal hanging over fresh results

  const a = audioEl();
  a.pause();
  a.removeAttribute("src");
  active = null;
  pendingSeek = null;

  const head = document.getElementById("head");
  if (head) head.textContent = data.heading || "Free To Use";

  const list = document.getElementById("list");
  if (!list) return;
  list.textContent = "";
  rows = [];
  if (tracks.length) {
    appendRows(tracks);
  } else {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No tracks found.";
    list.appendChild(empty);
  }

  curTotal = typeof data.total === "number" ? data.total : tracks.length;
  renderedCount = (data.offset || 0) + tracks.length;
  curMore = data.more || null;

  // No sort dropdown / Load more on an empty result.
  configureSort(tracks.length ? data : { ...data, sort: null });
  wireAudioOnce();
  renderLoadMore();
}

// ChatGPT exposes results on window.openai.toolOutput, set at mount or a beat
// after. Render it whenever it appears or changes — guarded so repeated host
// "globals updated" events don't re-render the same result and reset playback.
let lastOutput: any = null;
function renderToolOutput(): void {
  const oa: any = (window as any).openai;
  const out = oa && oa.toolOutput;
  if (out && out.tracks && out !== lastOutput) {
    lastOutput = out;
    render(out);
  }
}

function init(): void {
  // Match the host colour scheme up front, then keep it in sync with host globals
  // changes and OS-level scheme flips.
  applyTheme();
  window.addEventListener("openai:set_globals", applyTheme);
  try {
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", applyTheme);
      else if (mq.addListener) mq.addListener(applyTheme); // older Safari
    }
  } catch (_e) {}

  // 1) MCP Apps standard bridge (used for tool results AND host-mediated download).
  try {
    appInstance = new App({ name: "Free To Use", version: "0.1.0" });
    appInstance.ontoolresult = (result: any) => {
      const sc = result && result.structuredContent;
      if (sc && sc.tracks) render(sc);
    };
    // Re-apply the theme when the host's context changes (e.g. a dark/light toggle).
    try {
      if (appInstance.addEventListener) appInstance.addEventListener("hostcontextchanged", applyTheme);
    } catch (_e) {}
    const c = appInstance.connect && appInstance.connect();
    // getHostContext() only returns a theme once connected, so re-run applyTheme
    // after the handshake resolves — that's when a standard host's theme lands.
    if (c && c.then) c.then(() => { appConnected = true; applyTheme(); }).catch(() => {});
  } catch (_e) {
    /* not inside a standard MCP Apps host */
  }

  // 2) ChatGPT Apps SDK bridge. toolOutput may be present now or populate just
  //    after mount, so render it now, on the host's globals event, and via a short
  //    poll covering the mount race (the event name isn't contractual).
  renderToolOutput();
  window.addEventListener("openai:set_globals", renderToolOutput);
  if ((window as any).openai) {
    let tries = 0;
    const poll = setInterval(() => {
      renderToolOutput();
      if (rendered || ++tries >= 30) clearInterval(poll); // ~3s safety net
    }, 100);
  }

  // 3) Demo data — ONLY on the standalone /preview route (flagged by the server).
  //    In a real host we wait for the actual results rather than flashing a sample
  //    track, so a search never briefly shows an unrelated track.
  if ((window as any).__FTU_PREVIEW__) {
    setTimeout(() => {
      if (!rendered) render(FALLBACK);
    }, 150);
  }
}

if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
