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

const PAGE_SIZE = 20;

interface UseTracksResult {
  tracks: Track[];
  categories: Category[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  saveSnapshot: () => TrackSnapshot;
  restoreSnapshot: (snapshot: TrackSnapshot) => void;
  setNextFetchLimit: (limit: number) => void;
}

export interface TrackSnapshot {
  tracks: Track[];
  hasMore: boolean;
  offset: number;
}

export function useTracks(
  query: string,
  categoryId: string | null,
  relatedToId: string | null,
  ready = true,
  initialLimit = 0,
): UseTracksResult {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const skipNextFetchRef = useRef(false);
  const nextFetchLimitRef = useRef(initialLimit > PAGE_SIZE ? initialLimit : 0);

  // Load categories once; persist shuffle order so it stays consistent across reopens
  useEffect(() => {
    const CAT_ORDER_KEY = "ftu_category_order";
    getCategories({ limit: 200 }).then((res) => {
      chrome.storage.session.get(CAT_ORDER_KEY, (stored) => {
        const savedOrder: string[] | undefined = stored[CAT_ORDER_KEY];
        if (savedOrder && savedOrder.length > 0) {
          // Reorder categories to match saved order, append any new ones at the end
          const byId = new Map(res.data.map((c) => [c.id, c]));
          const ordered: Category[] = [];
          for (const id of savedOrder) {
            const cat = byId.get(id);
            if (cat) {
              ordered.push(cat);
              byId.delete(id);
            }
          }
          // Append any categories not in saved order
          for (const cat of byId.values()) ordered.push(cat);
          setCategories(ordered);
        } else {
          const shuffled = [...res.data].sort(() => Math.random() - 0.5);
          chrome.storage.session.set({ [CAT_ORDER_KEY]: shuffled.map((c) => c.id) });
          setCategories(shuffled);
        }
      });
    });
  }, []);

  // Load tracks when query, category, or relatedToId changes
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
    const limit = nextFetchLimitRef.current > PAGE_SIZE
      ? nextFetchLimitRef.current
      : PAGE_SIZE;

    fetchTracks(query, categoryId, relatedToId, 0, limit).then((res) => {
      if (controller.signal.aborted) return;
      // Only clear the override after a successful non-aborted fetch
      nextFetchLimitRef.current = 0;
      setTracks(res.data);
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
      setTracks((prev) => [...prev, ...res.data]);
      offsetRef.current = offset + res.data.length;
      setHasMore(res.data.length >= PAGE_SIZE);
      setLoading(false);
    });
  }, [query, categoryId, relatedToId]);

  const saveSnapshot = useCallback((): TrackSnapshot => {
    return { tracks, hasMore, offset: offsetRef.current };
  }, [tracks, hasMore]);

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

  return { tracks, categories, loading, hasMore, loadMore, saveSnapshot, restoreSnapshot, setNextFetchLimit };
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
    return searchTracks({ query, limit, offset, order: "downloads", sort: "desc" });
  }
  if (categoryId) {
    return getCategoryTracks(categoryId, { limit, offset, order: "staff_order" });
  }
  return getTracks({ limit, offset, order: "staff_order" });
}
