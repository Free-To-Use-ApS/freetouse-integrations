// Client-side logic for the results widget. Bundled by esbuild into a browser
// IIFE and inlined into the widget HTML. Renders a list of tracks and plays
// any of them inline (one shared <audio>).
//
// Track data arrives via whichever host bridge is present:
//   1. window.openai.toolOutput          — ChatGPT Apps SDK (synchronous)
//   2. ext-apps App.ontoolresult         — cross-host MCP Apps standard (Claude, …)
//   3. an embedded fallback list         — so the widget always renders (/preview)
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
}

const FALLBACK: { query?: string; tracks: UiTrack[] } = {
  query: "lofi",
  tracks: [
    {
      title: "remedy",
      artist: "massobeats",
      duration: 107.75,
      mp3: "https://data.freetouse.com/music/tracks/4a5a2691-46b7-4624-a1f7-d83914f65c74/file/mp3/file.mp3",
      art: "https://data.freetouse.com/music/tracks/4a5a2691-46b7-4624-a1f7-d83914f65c74/cover/webp/md/cover-md.webp",
      url: "https://freetouse.com/music/massobeats/remedy",
      tags: ["chillhop", "dreamy"],
      genre: "Instrumental",
      description: "Aesthetic Lofi track with chillhop, dreamy vibes.",
    },
  ],
};

const audio = (): any => document.getElementById("audio");

function fmt(sec?: number): string {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

let rendered = false;
let activeBtn: any = null;

function render(data: { query?: string; tracks?: UiTrack[] } | null | undefined): void {
  const tracks = (data && data.tracks) || [];
  if (!tracks.length) return;
  rendered = true;

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

  tracks.forEach((t) => {
    const row = document.createElement("div");
    row.className = "row";

    const cover = document.createElement("img");
    cover.className = "cover";
    cover.alt = "";
    if (t.art) cover.src = t.art;

    const info = document.createElement("div");
    info.className = "info";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = t.title || "Untitled";
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = [t.artist, t.genre].filter(Boolean).join(" · ");
    info.appendChild(title);
    info.appendChild(sub);
    if (t.description) {
      const desc = document.createElement("div");
      desc.className = "desc";
      desc.textContent = t.description;
      info.appendChild(desc);
    }
    if (t.tags && t.tags.length) {
      const tags = document.createElement("div");
      tags.className = "tags";
      t.tags.slice(0, 4).forEach((tg) => {
        const el = document.createElement("span");
        el.className = "tag";
        el.textContent = tg;
        tags.appendChild(el);
      });
      info.appendChild(tags);
    }

    const right = document.createElement("div");
    right.className = "right";
    const btn = document.createElement("button");
    btn.className = "play";
    btn.textContent = "▶"; // ▶
    btn.setAttribute("aria-label", "Play " + (t.title || ""));
    right.appendChild(btn);
    if (t.url) {
      const link = document.createElement("a");
      link.className = "link";
      link.href = t.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Download";
      right.appendChild(link);
    } else {
      const dur = document.createElement("div");
      dur.className = "dur";
      dur.textContent = fmt(t.duration);
      right.appendChild(dur);
    }

    btn.addEventListener("click", () => {
      const a = audio();
      if (!t.mp3) return;
      const playingThis = a.getAttribute("src") === t.mp3 && !a.paused;
      if (playingThis) {
        a.pause();
        btn.textContent = "▶";
        return;
      }
      if (activeBtn && activeBtn !== btn) activeBtn.textContent = "▶";
      document.querySelectorAll(".row.active").forEach((r) => r.classList.remove("active"));
      if (a.getAttribute("src") !== t.mp3) a.src = t.mp3;
      row.classList.add("active");
      activeBtn = btn;
      btn.textContent = "⏸"; // ⏸
      const p = a.play();
      if (p && p.catch) p.catch(() => (btn.textContent = "▶"));
    });

    row.appendChild(cover);
    row.appendChild(info);
    row.appendChild(right);
    list.appendChild(row);
  });

  const a = audio();
  a.onended = () => {
    if (activeBtn) activeBtn.textContent = "▶";
    document.querySelectorAll(".row.active").forEach((r) => r.classList.remove("active"));
  };
}

function init(): void {
  // 1) ChatGPT Apps SDK bridge (synchronous).
  const oa: any = (window as any).openai;
  if (oa && oa.toolOutput && oa.toolOutput.tracks) {
    render(oa.toolOutput);
  }

  // 2) MCP Apps standard bridge (Claude and other MCP-Apps hosts; async).
  try {
    const app: any = new App({ name: "Free To Use", version: "0.1.0" });
    app.ontoolresult = (result: any) => {
      const sc = result && result.structuredContent;
      if (sc && sc.tracks) render(sc);
    };
    if (app.connect) {
      const c = app.connect();
      if (c && c.catch) c.catch(() => {});
    }
  } catch (_e) {
    /* not inside a standard MCP Apps host */
  }

  // 3) Fallback so the widget always renders (e.g. the /preview route).
  setTimeout(() => {
    if (!rendered) render(FALLBACK);
  }, 350);
}

if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
