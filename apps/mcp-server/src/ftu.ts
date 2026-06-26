// Domain logic over the public Free To Use API.
//
// Strategy: the API's text search is strict (multi-word natural-language
// queries often return nothing), so instead we hold the whole catalog in an
// in-memory index (one /tracks/all request, ~1.5k tracks) and rank it locally
// by how well each track's tags / categories / genre / title match the query.
// This is robust to phrasing, instant per search, and easy on the API.
//
// We only ever expose a trimmed shape (no raw waveform / stats) plus a short,
// honest description synthesized from real metadata and a precomputed loudness
// `gain` (derived from the waveform) so downstream players can level volume.
import {
  getCategories,
  getTracks,
  waveformToGain,
  type Track,
} from "@freetouse/api";

export interface UiTrack {
  id: string;
  title: string;
  artist: string;
  /** seconds */
  duration: number;
  mp3: string;
  art: string;
  /** Listen & download page on freetouse.com */
  url: string;
  /** First few tags (real metadata) */
  tags: string[];
  genre: string | null;
  /** One-sentence blurb synthesized from genre + categories + tags */
  description: string;
  /**
   * Attenuate-only loudness multiplier (0..1) derived from the track's waveform,
   * so a downstream player can keep volume consistent across tracks. Assign
   * directly to an HTMLAudioElement.volume or a Web Audio GainNode target.
   */
  gain: number;
  /** Downsampled loudness bars (0-100) for rendering the waveform scrubber. */
  peaks: number[];
  /** First two tags/categories, capitalized — shown as pills (like freetouse.com). */
  chips: string[];
}

interface IndexEntry extends UiTrack {
  downloads: number;
  /** Lowercased tag + category names, for high-weight matching */
  tagcat: string;
  /** Lowercased title + artist + genre, for low-weight matching */
  text: string;
}

export const MAX_RESULTS = 12;
export const DEFAULT_RESULTS = 6;

// --- formatting helpers -----------------------------------------------------

export function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Number of waveform bars sent to the widget. The API waveform is 300 points;
// ~80 bars reads cleanly at the mini-player's width.
const WAVE_BARS = 80;

/** Downsample the 300-point loudness array to `bars` averaged integers (0-100). */
function downsamplePeaks(waveform: number[] | undefined, bars: number): number[] {
  if (!waveform || waveform.length === 0) return [];
  const step = waveform.length / bars;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    let n = 0;
    for (let j = start; j < end && j < waveform.length; j++) {
      sum += waveform[j];
      n++;
    }
    out.push(n ? Math.round(sum / n) : 0);
  }
  return out;
}

function describe(
  genre: string | null,
  cats: string[],
  tags: string[],
  types: Map<string, string>,
): string {
  const moods = cats.filter((c) => types.get(c) === "Mood");
  const genreCats = cats.filter((c) => types.get(c) === "Genre");
  const uses = cats.filter((c) => types.get(c) === "Video");

  const adj = moods[0];
  const gen = genreCats[0] ?? genre ?? null;
  const vibes = tags.slice(0, 3);

  let s = adj ? `${cap(adj.toLowerCase())} ` : "";
  s += gen ? `${gen} track` : "track";
  if (!adj) s = cap(s);
  if (vibes.length) s += ` with ${vibes.join(", ")} vibes`;
  if (uses.length) s += `, great for ${uses.slice(0, 2).join(" & ")} videos`;
  return s + ".";
}

// --- catalog index ----------------------------------------------------------

const INDEX_TTL = 6 * 60 * 60 * 1000; // 6h
let indexCache: { entries: IndexEntry[]; expires: number } | null = null;
let indexLoading: Promise<IndexEntry[]> | null = null;

async function categoryTypes(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await getCategories({ limit: 200 });
    for (const c of res.data) map.set(c.name, c.type);
  } catch {
    /* description degrades gracefully without type info */
  }
  return map;
}

function toEntry(t: Track, types: Map<string, string>): IndexEntry {
  const artists = (t.artists ?? []).map(([, a]) => a?.name).filter(Boolean) as string[];
  const artist = artists[0] ?? "Free To Use";
  const tags = (t.tags ?? []).map(([, name]) => name).filter(Boolean) as string[];
  const cats = (t.categories ?? [])
    .map(([, c]) => (typeof c === "string" ? c : c?.name))
    .filter(Boolean) as string[];
  // First two tags/categories (combined, in API order), capitalized — exactly
  // what freetouse.com shows as pills (see canva-app TrackItem getTagLabels).
  const chips = (t.tags_categories ?? [])
    .map(([, item]) => (typeof item === "string" ? item : item?.name))
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => cap(s as string));
  return {
    id: t.id,
    title: t.title,
    artist,
    duration: t.duration,
    mp3: t.files.mp3,
    art: t.thumbnails?.md ?? t.thumbnails?.lg ?? "",
    url: `https://freetouse.com/music/${slug(artist)}/${slug(t.title)}`,
    tags: tags.slice(0, 5),
    genre: t.genre,
    description: describe(t.genre, cats, tags, types),
    gain: waveformToGain(t.waveform),
    peaks: downsamplePeaks(t.waveform, WAVE_BARS),
    chips,
    downloads: t.downloads ?? 0,
    tagcat: [...tags, ...cats].join(" ").toLowerCase(),
    text: [t.title, artist, t.genre ?? ""].join(" ").toLowerCase(),
  };
}

async function buildIndex(): Promise<IndexEntry[]> {
  const types = await categoryTypes();
  // The whole catalog returns in a single request; staff_order is the default
  // and we preserve it for the empty-query (curated) case.
  const res = await getTracks({ limit: 2000, order: "staff_order" });
  return (res.data ?? []).map((t) => toEntry(t, types));
}

async function getIndex(): Promise<IndexEntry[]> {
  if (indexCache && indexCache.expires > Date.now()) return indexCache.entries;
  if (indexLoading) return indexLoading;
  indexLoading = buildIndex()
    .then((entries) => {
      indexCache = { entries, expires: Date.now() + INDEX_TTL };
      return entries;
    })
    .finally(() => {
      indexLoading = null;
    });
  // If a refresh fails but we have a stale copy, keep serving it.
  try {
    return await indexLoading;
  } catch (e) {
    if (indexCache) return indexCache.entries;
    throw e;
  }
}

/** Pre-warm the index at startup so the first search is instant. */
export async function warmUp(): Promise<number> {
  const entries = await getIndex();
  return entries.length;
}

// --- query ranking ----------------------------------------------------------

const STOPWORDS = new Set([
  "a", "an", "the", "for", "to", "of", "with", "and", "or", "in", "on", "at",
  "my", "me", "i", "some", "any", "that", "this", "is", "are", "be",
  "music", "song", "songs", "track", "tracks", "tune", "tunes", "sound", "sounds",
  "vibe", "vibes", "background", "bg", "please", "want", "need", "find", "looking",
  "give", "play", "something", "kind", "type", "royalty", "free",
]);

function terms(query: string): string[] {
  const raw = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const out = new Set<string>();
  for (const w of raw) {
    out.add(w);
    // light stemming so "studying"~"study", "beats"~"beat", "relaxing"~"relax"
    if (w.endsWith("ing") && w.length > 5) out.add(w.slice(0, -3));
    else if (w.endsWith("s") && w.length > 3) out.add(w.slice(0, -1));
  }
  return [...out];
}

function score(entry: IndexEntry, ts: string[]): number {
  let s = 0;
  for (const t of ts) {
    if (entry.tagcat.includes(t)) s += 3; // tag / category match (strong signal)
    else if (entry.text.includes(t)) s += 1; // title / artist / genre match
  }
  return s;
}

function strip(e: IndexEntry): UiTrack {
  const { downloads: _d, tagcat: _tc, text: _t, ...ui } = e;
  return ui;
}

/**
 * Find tracks matching a free-text query (mood / genre / activity / vibe).
 * Ranks the local catalog by tag/category/genre/title matches. Empty query
 * returns curated (staff-order) tracks. Returns [] when nothing matches.
 */
export async function searchMusic(
  query: string,
  limit: number = DEFAULT_RESULTS,
): Promise<UiTrack[]> {
  const n = Math.min(Math.max(1, Math.floor(limit) || DEFAULT_RESULTS), MAX_RESULTS);
  const entries = await getIndex();

  const ts = terms(query ?? "");
  if (ts.length === 0) {
    return entries.slice(0, n).map(strip); // curated picks
  }

  const ranked = entries
    .map((e) => ({ e, s: score(e, ts) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.e.downloads - a.e.downloads)
    .slice(0, n)
    .map((x) => strip(x.e));

  return ranked;
}
