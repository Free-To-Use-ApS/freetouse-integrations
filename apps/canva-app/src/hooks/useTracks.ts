import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Track,
  type Category,
  getTracks,
  searchTracks,
  getCategories,
  getCategoryTracks,
  getRelatedTracks,
} from "@freetouse/api";
import { loadCategoryOrder, persistCategoryOrder } from "../utils/storage";

const PAGE_SIZE = 20;

export interface TrackSnapshot {
  tracks: Track[];
  hasMore: boolean;
  offset: number;
}

export interface UseTracksResult {
  tracks: Track[];
  categories: Category[];
  loading: boolean;
  categoriesLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  saveSnapshot: () => TrackSnapshot;
  restoreSnapshot: (snapshot: TrackSnapshot) => void;
  setNextFetchLimit: (limit: number) => void;
}

export function useTracks(
  query: string,
  categoryId: string | null,
  relatedToId: string | null = null,
  ready: boolean = true,
  initialLimit: number = 0,
): UseTracksResult {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const skipNextFetchRef = useRef(false);
  const nextFetchLimitRef = useRef(
    initialLimit > PAGE_SIZE ? initialLimit : 0,
  );

  // Load categories once on mount. Persist the shuffled order so the bar
  // looks the same when the panel is reopened during the same session.
  useEffect(() => {
    getCategories({ limit: 200 })
      .then((res) => {
        const savedOrder = loadCategoryOrder();
        if (savedOrder && savedOrder.length > 0) {
          // Reorder categories to match saved order, append any new ones
          const byId = new Map(res.data.map((c) => [c.id, c]));
          const ordered: Category[] = [];
          for (const id of savedOrder) {
            const cat = byId.get(id);
            if (cat) {
              ordered.push(cat);
              byId.delete(id);
            }
          }
          for (const cat of byId.values()) ordered.push(cat);
          setCategories(ordered);
        } else {
          const shuffled = [...res.data].sort(() => Math.random() - 0.5);
          persistCategoryOrder(shuffled.map((c) => c.id));
          setCategories(shuffled);
        }
      })
      .finally(() => setCategoriesLoading(false));
  }, []);

  // Load tracks when query / category / relatedToId changes (and ready)
  useEffect(() => {
    if (!ready) return;

    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setTracks([]);
    offsetRef.current = 0;

    // Use override limit if set (for restoring scroll position)
    const limit =
      nextFetchLimitRef.current > PAGE_SIZE
        ? nextFetchLimitRef.current
        : PAGE_SIZE;

    fetchTracks(query, categoryId, relatedToId, 0, limit).then((res) => {
      if (controller.signal.aborted) return;
      // Only clear the override after a successful, non-aborted fetch
      nextFetchLimitRef.current = 0;
      setTracks(res.data as Track[]);
      offsetRef.current = res.data.length;
      setHasMore(res.data.length >= limit);
      setLoading(false);
    });

    return () => controller.abort();
  }, [query, categoryId, relatedToId, ready]);

  const loadMore = useCallback(() => {
    const offset = offsetRef.current;
    setLoading(true);

    fetchTracks(query, categoryId, relatedToId, offset).then((res) => {
      setTracks((prev) => [...prev, ...(res.data as Track[])]);
      offsetRef.current = offset + res.data.length;
      setHasMore(res.data.length >= PAGE_SIZE);
      setLoading(false);
    });
  }, [query, categoryId, relatedToId]);

  const saveSnapshot = useCallback(
    (): TrackSnapshot => ({
      tracks,
      hasMore,
      offset: offsetRef.current,
    }),
    [tracks, hasMore],
  );

  const restoreSnapshot = useCallback((snapshot: TrackSnapshot) => {
    skipNextFetchRef.current = true;
    setTracks(snapshot.tracks);
    setHasMore(snapshot.hasMore);
    setLoading(false);
    offsetRef.current = snapshot.offset;
  }, []);

  const setNextFetchLimit = useCallback((limit: number) => {
    nextFetchLimitRef.current = limit;
  }, []);

  return {
    tracks,
    categories,
    loading,
    categoriesLoading,
    hasMore,
    loadMore,
    saveSnapshot,
    restoreSnapshot,
    setNextFetchLimit,
  };
}

function fetchTracks(
  query: string,
  categoryId: string | null,
  relatedToId: string | null,
  offset: number,
  limit = PAGE_SIZE,
) {
  if (relatedToId) {
    return getRelatedTracks(relatedToId, { limit, offset });
  }
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
