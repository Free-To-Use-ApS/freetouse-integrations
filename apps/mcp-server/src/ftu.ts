// Domain logic over the public Free To Use API.
//
// We hold the whole catalog in an in-memory index (one /tracks/all request,
// ~1.5k tracks, refreshed every 6h) and rank/filter it locally. This is robust
// to phrasing, instant per request, supports pagination, and is easy on the API.
// find_similar is the exception — it uses the API's own /related model.
//
// We only ever expose a trimmed shape (no raw waveform / stats) plus a short
// description, a precomputed loudness `gain`, ready-to-use attribution text, and
// a premium flag.
import {
  getCategories,
  getCategoryTracks,
  getRelatedTracks,
  getTracks,
  waveformToGain,
  type Track,
  type Category,
  type TrackOrder,
  type SortDirection,
} from "@freetouse/api";

export interface UiTrack {
  id: string;
  title: string;
  /** All artists, comma-joined (e.g. "Pufino" or "Aylex, Limujii"). */
  artist: string;
  /** seconds */
  duration: number;
  mp3: string;
  art: string;
  /** Listen & download page on freetouse.com */
  url: string;
  /** Artist page on freetouse.com (the first/primary artist). */
  artistUrl: string;
  /** First few tags (real metadata) */
  tags: string[];
  genre: string | null;
  /** One-sentence blurb synthesized from genre + categories + tags */
  description: string;
  /** Loudness multiplier (0..1) from the waveform, for consistent volume. */
  gain: number;
  /** Downsampled loudness bars (0-100) for the waveform scrubber. */
  peaks: number[];
  /**
   * First two tags/categories, capitalized — shown as pills. Each links to its
   * freetouse.com page: a category to /music/category/<slug>, a free-form tag to
   * the search page /music/search/<slug>.
   */
  chips: { label: string; href: string }[];
  /** True if the track requires a subscription or single-track license. */
  premium: boolean;
  /** Ready-to-paste credit text (same format as the FTU apps). */
  attribution: string;
}

interface IndexEntry extends UiTrack {
  downloads: number;
  /** Play count — fewest first powers the "undiscovered" sort. */
  plays: number;
  /** release_date as epoch ms — most recent first powers the "newest" sort. */
  released: number;
  /** Curated staff_order — ascending is the "staff picks" sort. */
  staffOrder: number;
  titleLc: string;
  artistLc: string;
  genreLc: string;
  /** Lowercased tag + category names (combined). */
  tagcat: string;
  /** Lowercased category names only (for browse-by-category). */
  catsLc: string[];
}

/**
 * Track ordering. "relevance" = best keyword match (search only); the rest mirror
 * the freetouse.com sort dropdown. "undiscovered" = fewest plays (hidden gems).
 */
export type SortKey = "relevance" | "staff" | "popular" | "newest" | "undiscovered";

/** A page of results plus the totals a client needs to paginate. */
export interface TrackPage {
  tracks: UiTrack[];
  total: number;
  offset: number;
  limit: number;
  /** The ordering actually applied, so the widget's sort dropdown can reflect it. */
  sort?: SortKey;
}

export const DEFAULT_RESULTS = 20;
export const MAX_RESULTS = 50;

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

const WAVE_BARS = 80;

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

// --- categories (cached) ----------------------------------------------------

const CATEGORY_TTL = 24 * 60 * 60 * 1000;
let categoryCache: { list: Category[]; expires: number } | null = null;

async function categoriesList(): Promise<Category[]> {
  if (categoryCache && categoryCache.expires > Date.now()) return categoryCache.list;
  try {
    const res = await getCategories({ limit: 300 });
    categoryCache = { list: res.data ?? [], expires: Date.now() + CATEGORY_TTL };
  } catch {
    if (categoryCache) return categoryCache.list;
    categoryCache = { list: [], expires: Date.now() + 60 * 1000 };
  }
  return categoryCache.list;
}

async function categoryTypes(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const c of await categoriesList()) map.set(c.name, c.type);
  return map;
}

/** Category names grouped by type (Genre / Mood / Video), for browsing. */
export async function listCategories(): Promise<{ type: string; categories: string[] }[]> {
  const groups = new Map<string, string[]>();
  for (const c of await categoriesList()) {
    if (!groups.has(c.type)) groups.set(c.type, []);
    groups.get(c.type)!.push(c.name);
  }
  return [...groups.entries()].map(([type, categories]) => ({ type, categories }));
}

// --- track mapping ----------------------------------------------------------

function attributionFor(title: string, artist: string): string {
  return `Music track: ${title} by ${artist}\nSource: https://freetouse.com/music`;
}

function toEntry(t: Track, types: Map<string, string>): IndexEntry {
  const artists = (t.artists ?? []).map(([, a]) => a?.name).filter(Boolean) as string[];
  const artist = artists.join(", ") || "Free To Use";
  const firstArtist = artists[0] ?? "Free To Use";
  const title = t.title ?? "Untitled";
  const tags = (t.tags ?? []).map(([, name]) => name).filter(Boolean) as string[];
  const cats = (t.categories ?? [])
    .map(([, c]) => (typeof c === "string" ? c : c?.name))
    .filter(Boolean) as string[];
  // In tags_categories, a category is an object ({id,name}) and a free-form tag
  // is a plain string — which decides where its pill links on freetouse.com.
  const chips = (t.tags_categories ?? [])
    .map(([, item]) => ({
      name: (typeof item === "string" ? item : item?.name) ?? "",
      isCategory: typeof item !== "string",
    }))
    .filter((c) => c.name)
    .slice(0, 2)
    .map((c) => ({
      label: cap(c.name),
      href: c.isCategory
        ? `https://freetouse.com/music/category/${slug(c.name)}`
        : `https://freetouse.com/music/search/${slug(c.name)}`,
    }));
  return {
    id: t.id,
    title,
    artist,
    duration: t.duration ?? 0,
    mp3: t.files?.mp3 ?? "",
    art: t.thumbnails?.md ?? t.thumbnails?.lg ?? "",
    url: `https://freetouse.com/music/${slug(firstArtist)}/${slug(title)}`,
    artistUrl: `https://freetouse.com/music/${slug(firstArtist)}`,
    tags: tags.slice(0, 5),
    genre: t.genre,
    description: describe(t.genre, cats, tags, types),
    gain: waveformToGain(t.waveform),
    peaks: downsamplePeaks(t.waveform, WAVE_BARS),
    chips,
    premium: Boolean(t.is_premium),
    attribution: attributionFor(title, artist),
    downloads: t.downloads ?? 0,
    plays: t.plays ?? 0,
    released: Date.parse(t.release_date ?? "") || 0,
    staffOrder: t.staff_order ?? 0,
    titleLc: title.toLowerCase(),
    artistLc: artist.toLowerCase(),
    genreLc: (t.genre ?? "").toLowerCase(),
    tagcat: [...tags, ...cats].join(" ").toLowerCase(),
    catsLc: cats.map((c) => c.toLowerCase()),
  };
}

// --- catalog index ----------------------------------------------------------

const INDEX_TTL = 6 * 60 * 60 * 1000; // 6h
let indexCache: { entries: IndexEntry[]; expires: number } | null = null;
let indexLoading: Promise<IndexEntry[]> | null = null;

async function buildIndex(): Promise<IndexEntry[]> {
  const types = await categoryTypes();
  const res = await getTracks({ limit: 2000, order: "staff_order" });
  // Isolate per-track failures: one malformed record must not abort the whole
  // index. Skip entries missing the essentials (playable mp3, title).
  return (res.data ?? []).flatMap((t) => {
    try {
      if (!t?.files?.mp3 || !t?.title) return [];
      return [toEntry(t, types)];
    } catch {
      return [];
    }
  });
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
  try {
    return await indexLoading;
  } catch (e) {
    if (indexCache) return indexCache.entries;
    throw e;
  }
}

/** Pre-warm the index at startup so the first request is instant. */
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

// Each query word becomes a group of variants (the word + a light stem). Grouping
// (rather than a flat list) lets score() credit each word once even when the word
// and its stem both match — avoids inflating tracks that contain the longer form.
function terms(query: string): string[][] {
  const raw = (query ?? "")
    .toLowerCase()
    .replace(/-/g, "") // "lo-fi" -> "lofi"; avoids noisy 2-char "lo"/"fi" substring matches
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const w of raw) {
    if (seen.has(w)) continue;
    seen.add(w);
    const variants = [w];
    if (w.endsWith("ing") && w.length > 5) variants.push(w.slice(0, -3));
    else if (w.endsWith("s") && w.length > 3) variants.push(w.slice(0, -1));
    groups.push(variants);
  }
  return groups;
}

/** Whether a query yields any searchable terms (false for empty / all-stopword). */
export function hasUsableTerms(query: string): boolean {
  return terms(query ?? "").length > 0;
}

// For one track, how many distinct query words it matches (`matches`) and the
// summed strength of those matches (`weight`). Each word is credited once, at its
// best-matching field. `matches` drives precision (keep tracks that satisfy the
// MOST words); `weight` orders within a tier (title/artist beat tag beats genre).
function scoreEntry(entry: IndexEntry, groups: string[][]): { matches: number; weight: number } {
  let matches = 0;
  let weight = 0;
  for (const variants of groups) {
    let best = 0;
    for (const t of variants) {
      let f = 0;
      if (entry.titleLc.includes(t)) f = 5;
      else if (entry.artistLc.includes(t)) f = 5;
      else if (entry.tagcat.includes(t)) f = 3;
      else if (entry.genreLc.includes(t)) f = 2;
      if (f > best) best = f;
    }
    if (best > 0) matches++;
    weight += best;
  }
  return { matches, weight };
}

function strip(e: IndexEntry): UiTrack {
  const {
    downloads: _d,
    plays: _p,
    released: _r,
    staffOrder: _so,
    tagcat: _tc,
    titleLc: _t,
    artistLc: _a,
    genreLc: _g,
    catsLc: _c,
    ...ui
  } = e;
  return ui;
}

// Re-order a filtered result set by the chosen sort. "relevance" is handled by the
// caller (it needs the per-query match weight), so it's a no-op here.
function sortEntries(entries: IndexEntry[], sort: SortKey): IndexEntry[] {
  const arr = entries.slice();
  switch (sort) {
    case "popular":
      arr.sort((a, b) => b.downloads - a.downloads);
      break;
    case "newest":
      arr.sort((a, b) => b.released - a.released);
      break;
    case "undiscovered":
      arr.sort((a, b) => a.plays - b.plays);
      break;
    case "staff":
      arr.sort((a, b) => a.staffOrder - b.staffOrder);
      break;
  }
  return arr;
}

function clampLimit(limit?: number): number {
  return Math.min(Math.max(1, Math.floor(limit || DEFAULT_RESULTS)), MAX_RESULTS);
}

function paginate(entries: IndexEntry[], limit?: number, offset = 0): TrackPage {
  const n = clampLimit(limit);
  const start = Math.max(0, Math.floor(offset) || 0);
  return {
    tracks: entries.slice(start, start + n).map(strip),
    total: entries.length,
    offset: start,
    limit: n,
  };
}

// --- public API -------------------------------------------------------------

/** Search the catalog by mood / genre / activity / artist / title. */
export async function searchMusic(
  query: string,
  limit?: number,
  offset = 0,
  sort: SortKey = "relevance",
): Promise<TrackPage> {
  const entries = await getIndex();
  const ts = terms(query ?? "");
  if (ts.length === 0) {
    // No real query: a curated list. Default to staff picks (the index's order);
    // honor an explicit popular/newest/undiscovered/staff choice if asked.
    const useStaff = sort === "relevance" || sort === "staff";
    return {
      ...paginate(useStaff ? entries : sortEntries(entries, sort), limit, offset),
      sort: useStaff ? "staff" : sort,
    };
  }
  const scored = entries
    .map((e) => ({ e, ...scoreEntry(e, ts) }))
    .filter((x) => x.matches > 0);
  // Keep ONLY the tracks that satisfy the most query words, so a multi-word query
  // intersects rather than unions: "lofi tracks by pufino" -> Pufino's lofi tracks,
  // not every track matching "lofi" OR "pufino". (Single-word queries are
  // unaffected — every match has matches=1.)
  const maxMatches = scored.reduce((m, x) => (x.matches > m ? x.matches : m), 0);
  const tier = scored.filter((x) => x.matches === maxMatches);
  // Default order is relevance (field strength, then downloads). An explicit sort
  // re-orders the SAME matched set — it never changes which tracks are included.
  const ranked =
    sort === "relevance"
      ? tier.sort((a, b) => b.weight - a.weight || b.e.downloads - a.e.downloads).map((x) => x.e)
      : sortEntries(
          tier.map((x) => x.e),
          sort,
        );
  return { ...paginate(ranked, limit, offset), sort };
}

/** All tracks by an artist (case-insensitive name match). Defaults to newest. */
export async function browseArtist(
  artist: string,
  limit?: number,
  offset = 0,
  sort: SortKey = "newest",
): Promise<TrackPage> {
  const q = (artist ?? "").trim().toLowerCase();
  if (!q) return { ...paginate([], limit, offset), sort };
  const entries = await getIndex();
  // Exact name match first (split the comma-joined multi-artist field), so
  // "li" doesn't pull in "Limujii"/"Charlie". Fall back to substring only for
  // longer queries when nothing matched exactly (handles partial artist names).
  let matches = entries.filter((e) => e.artistLc === q || e.artistLc.split(", ").includes(q));
  if (matches.length === 0 && q.length >= 3) {
    matches = entries.filter((e) => e.artistLc.includes(q));
  }
  return { ...paginate(sortEntries(matches, sort), limit, offset), sort };
}

// Map our sort keys to the FTU list-endpoint order params (so a category lists in
// the same order as its page on freetouse.com — staff picks by default).
function apiOrder(sort: SortKey): { order: TrackOrder; sort?: SortDirection } {
  switch (sort) {
    case "popular":
      return { order: "downloads", sort: "desc" };
    case "newest":
      return { order: "release_date", sort: "desc" };
    case "undiscovered":
      return { order: "plays", sort: "asc" };
    default:
      return { order: "staff_order" }; // staff / relevance
  }
}

/**
 * All tracks in a category, via the API's own category-tracks endpoint — the same
 * source (and ordering) as the freetouse.com category page. We can't filter the
 * in-memory index by each track's `categories` field: that field is only a partial
 * subset, so it severely undercounts (e.g. "Inspiring" shows 23 instead of 119).
 * Defaults to staff picks.
 */
export async function browseCategory(
  category: string,
  limit?: number,
  offset = 0,
  sort: SortKey = "staff",
): Promise<TrackPage> {
  const q = (category ?? "").trim().toLowerCase();
  const n = clampLimit(limit);
  const start = Math.max(0, Math.floor(offset) || 0);
  if (!q) return { tracks: [], total: 0, offset: start, limit: n, sort };
  const cats = await categoriesList();
  const cat = cats.find((c) => c.name.toLowerCase() === q) ?? cats.find((c) => c.name.toLowerCase().includes(q));
  if (!cat) return { tracks: [], total: 0, offset: start, limit: n, sort };
  const types = await categoryTypes();
  const res = await getCategoryTracks(cat.id, { limit: n, offset: start, ...apiOrder(sort) });
  const data = res.data ?? [];
  // An empty page past the end means we've run out — report total = start so
  // hasMore is false (mirrors findSimilar's pagination guard).
  const total = data.length > 0 ? (res.pagination?.count ?? data.length) : start;
  const tracks = data.flatMap((t) => {
    try {
      if (!t?.files?.mp3 || !t?.title) return [];
      return [strip(toEntry(t, types))];
    } catch {
      return [];
    }
  });
  return { tracks, total, offset: start, limit: n, sort };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a track reference to a catalog id. Accepts a raw UUID, a freetouse.com
 * track URL, or a human reference ("Title", "Artist - Title", "Title by Artist") —
 * so find_similar works on hosts that only see the text channel (no structured id).
 * Returns null if nothing matches.
 */
// decodeURIComponent throws on a malformed %-escape; fall back to the raw segment
// so an odd pasted URL degrades to a normal title lookup rather than an error.
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function resolveTrackRef(ref: string): Promise<string | null> {
  const r = (ref ?? "").trim();
  if (!r) return null;
  if (UUID_RE.test(r)) return r;
  const entries = await getIndex();
  const pickByTitle = (tl: string, al: string): string | null => {
    if (!tl) return null;
    const matchArtist = (e: IndexEntry) => !al || e.artistLc.includes(al);
    let pool = entries.filter((e) => e.titleLc === tl && matchArtist(e));
    if (pool.length === 0 && tl.length >= 3) {
      pool = entries.filter((e) => e.titleLc.includes(tl) && matchArtist(e));
    }
    if (pool.length === 0) return null;
    pool.sort((a, b) => b.downloads - a.downloads);
    return pool[0].id;
  };
  // freetouse.com/music/<artist>/<title>
  const m = r.match(/freetouse\.com\/music\/([^/?#]+)\/([^/?#]+)/i);
  if (m) {
    const wanted = `/music/${slug(safeDecode(m[1]))}/${slug(safeDecode(m[2]))}`;
    const hit = entries.find((e) => e.url.toLowerCase().endsWith(wanted));
    if (hit) return hit.id;
  }
  const rl = r.toLowerCase();
  // Try the whole string as a title FIRST, so real titles containing " by " or
  // " - " (e.g. "Saved by Brothers") aren't mis-split into title + artist.
  const whole = pickByTitle(rl, "");
  if (whole) return whole;
  // Otherwise interpret "Artist - Title" / "Title by Artist".
  const dash = r.split(/\s+[-–—]\s+/);
  const by = r.split(/\s+by\s+/i);
  if (dash.length === 2) return pickByTitle(dash[1].trim().toLowerCase(), dash[0].trim().toLowerCase());
  if (by.length === 2) return pickByTitle(by[0].trim().toLowerCase(), by[1].trim().toLowerCase());
  return null;
}

/** Tracks similar to a given track id, using the API's /related model. */
export async function findSimilar(trackId: string, limit?: number, offset = 0): Promise<TrackPage> {
  const n = clampLimit(limit);
  const start = Math.max(0, Math.floor(offset) || 0);
  const types = await categoryTypes();
  const res = await getRelatedTracks(trackId, {
    limit: n,
    offset: start,
    order: "similarity",
    sort: "desc",
  });
  const data = res.data ?? [];
  // The /related endpoint echoes the requested offset into pagination.count once
  // offset overshoots the real total, which would inflate "X of N". An empty page
  // means we've reached the end — report total = start so hasMore is false.
  const total = data.length > 0 ? (res.pagination?.count ?? data.length) : start;
  return {
    tracks: data.map((t) => strip(toEntry(t, types))),
    total,
    offset: start,
    limit: n,
  };
}
