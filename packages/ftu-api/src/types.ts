// ---------------------------------------------------------------------------
// Free To Use API v3 – Type definitions
// Base URL: https://api.freetouse.com/v3
// No authentication required.
// ---------------------------------------------------------------------------

// -- Shared pagination & response types -------------------------------------

export interface Pagination {
  limit: number | null;
  offset: number;
  count: number;
}

export interface ApiResponse<T> {
  ok: true;
  data: T;
}

export interface PaginatedResponse<T> {
  ok: true;
  data: T[];
  pagination: Pagination;
}

export interface ApiError {
  ok: false;
  error: string;
}

// -- Thumbnails -------------------------------------------------------------

export interface Thumbnails {
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

// -- Track ------------------------------------------------------------------

export interface TrackArtist {
  id: string;
  name: string;
}

export interface TrackCategory {
  id: string;
  name: string;
}

export interface Track {
  id: string;
  title: string;
  /** Tuple of [sequence_number, artist] */
  artists: [number, TrackArtist][];
  genre: string | null;
  /** Language code or null */
  lyrics: string | null;
  status: 1;
  record_label: string;
  is_premium: boolean;
  /** Duration in seconds */
  duration: number;
  release_date: string;
  /** 300 integers (0–100) representing loudness over time */
  waveform: number[];
  staff_order: number;
  views: number;
  plays: number;
  likes: number;
  downloads: number;
  update_time: string;
  tags: [number, string][];
  categories: [number, TrackCategory][];
  tags_categories: [number, TrackCategory | string][];
  thumbnails: Thumbnails;
  files: { mp3: string };
}

export interface RelatedTrack extends Track {
  similarity: number;
}

// -- Artist -----------------------------------------------------------------

export interface Artist {
  id: string;
  name: string;
  description: string;
  status: 1;
  views: number;
  update_time: string;
  upload_date: string;
  thumbnails: Thumbnails;
}

// -- Category ---------------------------------------------------------------

export interface Category {
  id: string;
  type: string;
  type_id: string;
  name: string;
  description: string;
  thumbnails: Thumbnails;
}

// -- Query parameter types --------------------------------------------------

export type TrackOrder = "release_date" | "views" | "plays" | "downloads" | "staff_order" | "random";
export type RelatedOrder = TrackOrder | "similarity";
export type ArtistOrder = "name" | "views" | "random";
export type CategoryOrder = "name" | "type" | "views" | "random";
export type SortDirection = "asc" | "desc";

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface TrackListParams extends PaginationParams {
  order?: TrackOrder;
  sort?: SortDirection;
}

export interface TrackSearchParams extends TrackListParams {
  query: string;
}

export interface RelatedParams extends PaginationParams {
  order?: RelatedOrder;
  sort?: SortDirection;
}

export interface ArtistListParams extends PaginationParams {
  order?: ArtistOrder;
  sort?: SortDirection;
}

export interface CategoryListParams extends PaginationParams {
  order?: CategoryOrder;
  sort?: SortDirection;
}
