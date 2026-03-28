import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Track,
  type Category,
  getTracks,
  searchTracks,
  getCategories,
  getCategoryTracks,
} from "@freetouse/api";

const PAGE_SIZE = 20;

export interface UseTracksResult {
  tracks: Track[];
  categories: Category[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

export function useTracks(
  query: string,
  categoryId: string | null
): UseTracksResult {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Load categories once on mount
  useEffect(() => {
    getCategories({ limit: 200 }).then((res) => {
      // Shuffle categories randomly for variety
      const shuffled = [...res.data].sort(() => Math.random() - 0.5);
      setCategories(shuffled);
    });
  }, []);

  // Fetch tracks when query or category changes
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setTracks([]);
    offsetRef.current = 0;

    fetchTracks(query, categoryId, 0).then((res) => {
      if (controller.signal.aborted) return;
      setTracks(res.data);
      offsetRef.current = res.data.length;
      setHasMore(res.data.length >= PAGE_SIZE);
      setLoading(false);
    });

    return () => controller.abort();
  }, [query, categoryId]);

  const loadMore = useCallback(() => {
    const offset = offsetRef.current;
    setLoading(true);

    fetchTracks(query, categoryId, offset).then((res) => {
      setTracks((prev) => [...prev, ...res.data]);
      offsetRef.current = offset + res.data.length;
      setHasMore(res.data.length >= PAGE_SIZE);
      setLoading(false);
    });
  }, [query, categoryId]);

  return { tracks, categories, loading, hasMore, loadMore };
}

function fetchTracks(
  query: string,
  categoryId: string | null,
  offset: number,
  limit = PAGE_SIZE
) {
  if (query) {
    return searchTracks({
      query,
      limit,
      offset,
      order: "downloads",
      sort: "desc",
    });
  }
  if (categoryId) {
    return getCategoryTracks(categoryId, {
      limit,
      offset,
      order: "staff_order",
    });
  }
  return getTracks({ limit, offset, order: "staff_order" });
}
