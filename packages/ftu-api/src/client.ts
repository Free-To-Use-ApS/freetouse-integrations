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

const BASE_URL = "https://api.freetouse.com/v3";

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

async function request<T>(path: string, params: object = {}): Promise<T> {
  const url = `${BASE_URL}${path}${qs(params as Record<string, unknown>)}`;
  const res = await fetch(url);
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
  return request<PaginatedResponse<RelatedTrack>>(`/music/tracks/${id}/related`, params);
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
