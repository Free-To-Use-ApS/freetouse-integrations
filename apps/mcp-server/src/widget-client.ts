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
  tags?: string[];
  genre?: string | null;
  description?: string;
  gain?: number;
  peaks?: number[];
  chips?: string[];
}

interface RowState {
  track: UiTrack;
  el: any;
  bars: any[];
  durEl: any;
  playBtn: any;
  idx: number; // index of last "played" bar (-1 = none)
}

// Bootstrap Icons (play-fill, pause-fill, cloud-download) to match freetouse.com.
const PLAY = '<svg viewBox="0 0 16 16"><path d="m11.596 8.697-6.363 3.692C4.692 12.71 4 12.345 4 11.692V4.308c0-.653.692-1.018 1.233-.697l6.363 3.692a.802.802 0 0 1 0 1.394z"></path></svg>';
const PAUSE = '<svg viewBox="0 0 16 16"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5m5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5"></path></svg>';
const DL =
  '<svg viewBox="0 0 16 16">' +
  '<path d="M4.406 1.342A5.53 5.53 0 0 1 8 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 0 1 0-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 0 0-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 0 1 0 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383z"></path>' +
  '<path d="M7.646 15.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 14.293V5.5a.5.5 0 0 0-1 0v8.793l-2.146-2.147a.5.5 0 0 0-.708.708z"></path>' +
  "</svg>";

const DEFAULT_PEAKS: number[] = Array.from({ length: 80 }, (_v, i) =>
  22 + Math.round(45 * Math.abs(Math.sin(i / 3.5))),
);

const FALLBACK: { query?: string; tracks: UiTrack[] } = {
  query: "lofi",
  tracks: [
    {
      title: "remedy",
      artist: "massobeats",
      genre: "Instrumental",
      duration: 107.75,
      mp3: "https://data.freetouse.com/music/tracks/4a5a2691-46b7-4624-a1f7-d83914f65c74/file/mp3/file.mp3",
      art: "https://data.freetouse.com/music/tracks/4a5a2691-46b7-4624-a1f7-d83914f65c74/cover/webp/md/cover-md.webp",
      url: "https://freetouse.com/music/massobeats/remedy",
      tags: ["chillhop", "dreamy"],
      chips: ["Lofi", "Chillhop"],
      description: "Aesthetic Lofi track with chillhop, dreamy vibes.",
      gain: 0.8,
      peaks: DEFAULT_PEAKS,
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
let rows: RowState[] = [];
let active: RowState | null = null;
let pendingSeek: number | null = null;
let rendered = false;
let audioWired = false;

// --- waveform fill ----------------------------------------------------------

function setProgress(state: RowState, frac: number): void {
  const n = state.bars.length;
  let idx = Math.floor(frac * n);
  if (idx >= n) idx = n - 1;
  if (idx < -1) idx = -1;
  if (idx === state.idx) return;
  if (idx > state.idx) {
    for (let i = state.idx + 1; i <= idx; i++) state.bars[i].dataset.played = "true";
  } else {
    for (let i = state.idx; i > idx; i--) state.bars[i].dataset.played = "";
  }
  state.idx = idx;
}

function resetRow(state: RowState): void {
  for (let i = 0; i <= state.idx; i++) state.bars[i].dataset.played = "";
  state.idx = -1;
  state.durEl.textContent = fmt(state.track.duration);
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
  a.addEventListener("pause", () => { if (active) setRowPlaying(active, false); });
  a.addEventListener("ended", () => { if (active) { setRowPlaying(active, false); resetRow(active); } });
  a.addEventListener("loadedmetadata", () => {
    if (active && pendingSeek != null && a.duration) {
      a.currentTime = pendingSeek * a.duration;
      pendingSeek = null;
    }
  });
  a.addEventListener("timeupdate", () => {
    if (active && a.duration) setProgress(active, a.currentTime / a.duration);
  });
}

function playTrack(state: RowState): void {
  const a = audioEl();
  if (active === state) {
    if (a.paused) a.play().catch(() => {});
    else a.pause();
    return;
  }
  if (active) { resetRow(active); setRowPlaying(active, false); }
  active = state;
  pendingSeek = null;
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
    pendingSeek = frac;
    setProgress(state, frac);
    return;
  }
  const a = audioEl();
  if (a.duration) {
    a.currentTime = frac * a.duration;
    setProgress(state, frac);
  } else {
    pendingSeek = frac;
    setProgress(state, frac);
  }
}

// --- download (host-mediated) ----------------------------------------------

function download(track: UiTrack): void {
  if (!track.mp3) return;
  const name = `${track.artist || "Free To Use"} - ${track.title || "track"}.mp3`;
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

// --- rendering --------------------------------------------------------------

function buildRow(track: UiTrack): RowState {
  const el = document.createElement("div");
  el.className = "player";

  const cover = document.createElement("img");
  cover.className = "cover";
  cover.alt = "";
  if (track.art) cover.src = track.art;

  const meta = document.createElement("div");
  meta.className = "meta";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = track.title || "Untitled";
  const artist = document.createElement("div");
  artist.className = "artist";
  artist.textContent = track.artist || "";
  meta.appendChild(title);
  meta.appendChild(artist);

  // First two tags/categories as pills (like freetouse.com), in their own column.
  const chipList = track.chips && track.chips.length ? track.chips : track.tags || [];
  let chipsEl: any = null;
  if (chipList.length) {
    chipsEl = document.createElement("div");
    chipsEl.className = "chips";
    chipList.slice(0, 2).forEach((c) => {
      const s = document.createElement("span");
      s.className = "chip";
      s.textContent = c;
      chipsEl.appendChild(s);
    });
  }

  const playBtn = document.createElement("button");
  playBtn.className = "play";
  playBtn.innerHTML = PLAY;
  playBtn.setAttribute("aria-label", "Play " + (track.title || ""));

  const waveEl = document.createElement("div");
  waveEl.className = "ftu-wave";
  const peaks = track.peaks && track.peaks.length ? track.peaks : DEFAULT_PEAKS;
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
  // thing else lives in a padded body: meta | chips | play | wave | dur | dl,
  // with dividers around the chips and before the download.
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
  body.appendChild(dlBtn);
  el.appendChild(cover);
  el.appendChild(body);

  const state: RowState = { track, el, bars, durEl, playBtn, idx: -1 };

  playBtn.addEventListener("click", () => playTrack(state));
  dlBtn.addEventListener("click", () => download(track));

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

  return state;
}

function render(data: { query?: string; tracks?: UiTrack[] } | null | undefined): void {
  const tracks = (data && data.tracks) || [];
  if (!tracks.length) return;
  rendered = true;

  const a = audioEl();
  a.pause();
  a.removeAttribute("src");
  active = null;
  pendingSeek = null;

  const head = document.getElementById("head");
  if (head) {
    head.textContent =
      data && data.query
        ? `Free To Use — ${tracks.length} result${tracks.length > 1 ? "s" : ""} for "${data.query}"`
        : `Free To Use — ${tracks.length} track${tracks.length > 1 ? "s" : ""}`;
  }

  const list = document.getElementById("list");
  if (!list) return;
  list.textContent = "";
  rows = tracks.map((t) => {
    const st = buildRow(t);
    list.appendChild(st.el);
    return st;
  });
  wireAudioOnce();
}

function init(): void {
  // 1) MCP Apps standard bridge (used for tool results AND host-mediated download).
  try {
    appInstance = new App({ name: "Free To Use", version: "0.1.0" });
    appInstance.ontoolresult = (result: any) => {
      const sc = result && result.structuredContent;
      if (sc && sc.tracks) render(sc);
    };
    const c = appInstance.connect && appInstance.connect();
    if (c && c.catch) c.catch(() => {});
  } catch (_e) {
    /* not inside a standard MCP Apps host */
  }

  // 2) ChatGPT Apps SDK bridge (synchronous toolOutput).
  const oa: any = (window as any).openai;
  if (oa && oa.toolOutput && oa.toolOutput.tracks) render(oa.toolOutput);

  // 3) Fallback so the widget always renders (e.g. the /preview route).
  setTimeout(() => {
    if (!rendered) render(FALLBACK);
  }, 400);
}

if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
