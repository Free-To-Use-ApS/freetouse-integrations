import type {
  ApiResponse,
  Artist,
  ArtistListParams,
  Category,
  CategoryListParams,
  PaginatedResponse,
  RelatedParams,
  RelatedTrack,
  Track,
  TrackListParams,
  TrackSearchParams,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.freetouse.com/v3";
let baseUrl = DEFAULT_BASE_URL;

export function setBaseUrl(url: string) {
  baseUrl = url.replace(/\/+$/, "");
}

export function getBaseUrl() {
  return baseUrl;
}

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// Every outbound call is bounded by a timeout. Without one, a stalled upstream
// connection never settles — and because callers share an in-flight index-build
// promise, a single hung request can wedge all traffic on the instance.
const DEFAULT_TIMEOUT_MS = 8000;

async function request<T>(path: string, params: object = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const url = `${baseUrl}${path}${qs(params as Record<string, unknown>)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`FTU API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export function getTracks(params: TrackListParams = {}) {
  return request<PaginatedResponse<Track>>("/music/tracks/all", params);
}

export function searchTracks(params: TrackSearchParams) {
  return request<PaginatedResponse<Track>>("/music/tracks/search", params);
}

export function getTrack(id: string) {
  return request<ApiResponse<Track | null>>(`/music/tracks/${id}`);
}

export function getTrackBySlug(artist: string, title: string) {
  return request<ApiResponse<Track | null>>(`/music/tracks/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
}

export function getRelatedTracks(id: string, params: RelatedParams = {}) {
  return request<PaginatedResponse<RelatedTrack>>(`/music/tracks/${encodeURIComponent(id)}/related`, params);
}

// ---------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------

export function getArtists(params: ArtistListParams = {}) {
  return request<PaginatedResponse<Artist>>("/music/artists/all", params);
}

export function getArtist(id: string) {
  return request<ApiResponse<Artist | null>>(`/music/artists/${id}`);
}

export function getArtistTracks(id: string, params: TrackListParams = {}) {
  return request<PaginatedResponse<Track>>(`/music/artists/${id}/tracks`, params);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function getCategories(params: CategoryListParams = {}) {
  return request<PaginatedResponse<Category>>("/music/categories/all", params);
}

export function getCategory(id: string) {
  return request<ApiResponse<Category | null>>(`/music/categories/${id}`);
}

export function getCategoryTracks(id: string, params: TrackListParams = {}) {
  return request<PaginatedResponse<Track>>(`/music/categories/${id}/tracks`, params);
}
