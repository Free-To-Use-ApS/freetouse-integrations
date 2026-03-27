import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "@freetouse/api";
import { SearchBar } from "./components/SearchBar.js";
import { CategoryList } from "./components/CategoryList.js";
import { TrackList } from "./components/TrackList.js";
import { Player } from "./components/Player.js";
import { AttributionModal } from "./components/AttributionModal.js";
import { useTracks, type TrackSnapshot } from "./hooks/useTracks.js";

interface SavedView {
  query: string;
  categoryId: string | null;
  scrollTop: number;
  snapshot: TrackSnapshot;
}

const STORAGE_KEY = "ftu_popup_view";

interface PersistedView {
  categoryId: string | null;
  scrollTop: number;
  trackCount: number;
  relatedToId: string | null;
  // The view the user was on before entering related tracks (for back button)
  previousCategoryId?: string | null;
  previousScrollTop?: number;
  previousTrackCount?: number;
}

function persistView(view: Partial<PersistedView>) {
  chrome.storage.session.get(STORAGE_KEY, (result) => {
    const current = result[STORAGE_KEY] ?? {};
    chrome.storage.session.set({ [STORAGE_KEY]: { ...current, ...view } });
  });
}

export function App() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [relatedToId, setRelatedToId] = useState<string | null>(null);
  const [attributionTrack, setAttributionTrack] = useState<Track | null>(null);
  const [restored, setRestored] = useState(false);
  const scrollRestoredRef = useRef(false);
  const pendingScrollRef = useRef(0);
  const pendingBackScrollRef = useRef<number | null>(null);
  const savedViewRef = useRef<SavedView | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE_BACK = 20;

  const [initialLimit, setInitialLimit] = useState(0);

  const { tracks, categories, loading, hasMore, loadMore, saveSnapshot, restoreSnapshot, setNextFetchLimit } =
    useTracks(query, categoryId, relatedToId, restored, initialLimit);

  // Restore persisted state on mount
  useEffect(() => {
    chrome.storage.session.get(STORAGE_KEY, (result) => {
      const saved = result[STORAGE_KEY] as PersistedView | undefined;
      if (saved?.relatedToId) {
        setRelatedToId(saved.relatedToId);
        // Restore the previous view for the back button
        if (saved.previousCategoryId !== undefined) {
          savedViewRef.current = {
            query: "",
            categoryId: saved.previousCategoryId,
            scrollTop: saved.previousScrollTop ?? 0,
            snapshot: { tracks: [], hasMore: true, offset: saved.previousTrackCount ?? 20 },
          };
        }
      } else if (saved?.categoryId) {
        setCategoryId(saved.categoryId);
      }
      if (saved?.trackCount && saved.trackCount > 20) {
        setInitialLimit(saved.trackCount);
      }
      // Cache the scroll position so it survives later writes to storage
      pendingScrollRef.current = saved?.scrollTop ?? 0;
      setRestored(true);
    });
  }, []);

  // Restore scroll position once tracks have loaded after restore (only once)
  useEffect(() => {
    if (!restored || loading || tracks.length === 0 || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    const scrollTop = pendingScrollRef.current;
    if (scrollTop && contentRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = scrollTop;
          }
        });
      });
    }
  }, [restored, loading, tracks.length]);

  // Restore scroll after back navigation (when tracks are re-fetched, not from snapshot)
  useEffect(() => {
    if (pendingBackScrollRef.current === null || loading || tracks.length === 0) return;
    const scrollTop = pendingBackScrollRef.current;
    pendingBackScrollRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = scrollTop;
        }
      });
    });
  }, [loading, tracks.length]);

  // Persist scroll position and track count on scroll (debounced)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        persistView({ scrollTop: el.scrollTop, trackCount: tracks.length });
      }, 200);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, [categoryId, tracks.length]);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setRelatedToId(null);
    if (q) setCategoryId(null);
  }, []);

  const handleCategorySelect = useCallback((id: string | null) => {
    setCategoryId(id);
    setQuery("");
    setRelatedToId(null);
    persistView({ categoryId: id, scrollTop: 0, trackCount: 0, relatedToId: null });
  }, []);

  const handleFindSimilar = useCallback((trackId: string) => {
    const scrollTop = contentRef.current?.scrollTop ?? 0;
    savedViewRef.current = { query, categoryId, scrollTop, snapshot: saveSnapshot() };
    setRelatedToId(trackId);
    setQuery("");
    setCategoryId(null);
    persistView({
      relatedToId: trackId,
      categoryId: null,
      scrollTop: 0,
      trackCount: 0,
      previousCategoryId: categoryId,
      previousScrollTop: scrollTop,
      previousTrackCount: tracks.length,
    });
  }, [query, categoryId, saveSnapshot, tracks.length]);

  const handleBack = useCallback(() => {
    const saved = savedViewRef.current;
    if (saved) {
      const hasSnapshot = saved.snapshot.tracks.length > 0;
      if (hasSnapshot) {
        restoreSnapshot(saved.snapshot);
      } else {
        // After reopen, snapshot is empty — set limit so useTracks fetches enough tracks
        setNextFetchLimit(saved.snapshot.offset || PAGE_SIZE_BACK);
      }
      setQuery(saved.query);
      setCategoryId(saved.categoryId);
      setRelatedToId(null);
      const scrollTop = saved.scrollTop;
      savedViewRef.current = null;

      // Schedule scroll restore after tracks load
      pendingBackScrollRef.current = scrollTop;

      persistView({
        relatedToId: null,
        categoryId: saved.categoryId,
        scrollTop,
        trackCount: hasSnapshot ? saved.snapshot.tracks.length : saved.snapshot.offset,
        previousCategoryId: null,
        previousScrollTop: 0,
        previousTrackCount: 0,
      });

      if (hasSnapshot) {
        // Tracks already in memory, restore scroll immediately
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (contentRef.current) {
              contentRef.current.scrollTop = scrollTop;
            }
            pendingBackScrollRef.current = null;
          });
        });
      }
    } else {
      setRelatedToId(null);
      persistView({ relatedToId: null });
    }
  }, [restoreSnapshot, setNextFetchLimit]);

  return (
    <div className="app">
      <div className="app-header">
        {relatedToId ? (
          <button className="back-btn" onClick={handleBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            Related Tracks
          </button>
        ) : (
          <>
            <SearchBar onSearch={handleSearch} />
            {!query && (
              <CategoryList
                categories={categories}
                activeId={categoryId}
                onSelect={handleCategorySelect}
              />
            )}
          </>
        )}
      </div>
      <div className="app-content" ref={contentRef}>
        <TrackList
          tracks={tracks}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onFindSimilar={handleFindSimilar}
        />
      </div>
      <Player onDownload={setAttributionTrack} />
      {attributionTrack && (
        <AttributionModal
          track={attributionTrack}
          onClose={() => setAttributionTrack(null)}
        />
      )}
    </div>
  );
}
