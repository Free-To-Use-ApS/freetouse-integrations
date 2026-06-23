import { useCallback, useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Box, SurfaceHeader, Text } from "@canva/app-ui-kit";
import { useFeatureSupport } from "@canva/app-hooks";
import { addAudioTrack } from "@canva/design";
import { SearchBar } from "../../components/SearchBar";
import { LinksMenu } from "../../components/LinksMenu";
import { CategoryList } from "../../components/CategoryList";
import { TrackList } from "../../components/TrackList";
import { Player } from "../../components/Player";
import { useTracks, type TrackSnapshot } from "../../hooks/useTracks";
import { loadView, persistView } from "../../utils/storage";
import "../../styles/app.css";

interface SavedView {
  query: string;
  categoryId: string | null;
  scrollTop: number;
  snapshot: TrackSnapshot;
}

const PAGE_SIZE_BACK = 20;

export function App() {
  const intl = useIntl();
  const isSupported = useFeatureSupport();
  const audioSupported = isSupported(addAudioTrack);

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [relatedToId, setRelatedToId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const scrollRestoredRef = useRef(false);
  const pendingScrollRef = useRef(0);
  const pendingBackScrollRef = useRef<number | null>(null);
  const savedViewRef = useRef<SavedView | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const initialLimitRef = useRef(0);

  // Hydrate refs from sessionStorage synchronously (only once)
  if (!restored && initialLimitRef.current === 0) {
    const saved = loadView();
    if (saved.trackCount && saved.trackCount > PAGE_SIZE_BACK) {
      initialLimitRef.current = saved.trackCount;
    }
    pendingScrollRef.current = saved.scrollTop ?? 0;
  }

  const {
    tracks,
    categories,
    loading,
    categoriesLoading,
    hasMore,
    loadMore,
    saveSnapshot,
    restoreSnapshot,
    setNextFetchLimit,
  } = useTracks(
    query,
    categoryId,
    relatedToId,
    restored,
    initialLimitRef.current,
  );

  // On mount, restore persisted state and trigger the first fetch
  useEffect(() => {
    const saved = loadView();
    if (saved.relatedToId) {
      setRelatedToId(saved.relatedToId);
      // Reconstruct the in-memory back-navigation context
      if (saved.previousCategoryId !== undefined) {
        savedViewRef.current = {
          query: "",
          categoryId: saved.previousCategoryId,
          scrollTop: saved.previousScrollTop ?? 0,
          snapshot: {
            tracks: [],
            hasMore: true,
            offset: saved.previousTrackCount ?? PAGE_SIZE_BACK,
          },
        };
      }
    } else if (saved.categoryId) {
      setCategoryId(saved.categoryId);
    }
    setRestored(true);
  }, []);

  // Restore the vertical scroll position once tracks finish loading after
  // initial restore (only once per session)
  useEffect(() => {
    if (!restored || loading || tracks.length === 0 || scrollRestoredRef.current)
      return;
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

  // Restore scroll after the user clicks "Back" from related tracks
  useEffect(() => {
    if (
      pendingBackScrollRef.current === null ||
      loading ||
      tracks.length === 0
    )
      return;
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

  // Persist track count whenever it changes (e.g. after "Load more")
  useEffect(() => {
    if (!restored || tracks.length === 0) return;
    persistView({ trackCount: tracks.length });
  }, [restored, tracks.length]);

  // Persist scroll position on scroll (debounced)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        persistView({ scrollTop: el.scrollTop });
      }, 200);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, [categoryId, relatedToId]);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setRelatedToId(null);
    if (q) setCategoryId(null);
  }, []);

  const handleCategorySelect = useCallback((id: string | null) => {
    setCategoryId(id);
    setQuery("");
    setRelatedToId(null);
    persistView({
      categoryId: id,
      scrollTop: 0,
      trackCount: 0,
      relatedToId: null,
    });
  }, []);

  const handleFindSimilar = useCallback(
    (trackId: string) => {
      if (relatedToId === null) {
        // Coming from a non-related view (category, search, or All).
        // Capture it as the destination for the Back button.
        const scrollTop = contentRef.current?.scrollTop ?? 0;
        savedViewRef.current = {
          query,
          categoryId,
          scrollTop,
          snapshot: saveSnapshot(),
        };
        persistView({
          relatedToId: trackId,
          categoryId: null,
          scrollTop: 0,
          trackCount: 0,
          previousCategoryId: categoryId,
          previousScrollTop: scrollTop,
          previousTrackCount: tracks.length,
        });
      } else {
        // Already inside a related view — swap to the new related id without
        // overwriting the saved "back to" view, so Back still returns to the
        // original category / search the user started from.
        persistView({
          relatedToId: trackId,
          categoryId: null,
          scrollTop: 0,
          trackCount: 0,
        });
      }
      setRelatedToId(trackId);
      setQuery("");
      setCategoryId(null);
    },
    [query, categoryId, relatedToId, saveSnapshot, tracks.length],
  );

  const handleBack = useCallback(() => {
    const saved = savedViewRef.current;
    if (saved) {
      const hasSnapshot = saved.snapshot.tracks.length > 0;
      if (hasSnapshot) {
        restoreSnapshot(saved.snapshot);
      } else {
        // After a panel reopen, the in-memory snapshot is empty — tell the
        // hook to fetch enough tracks in one shot to restore the scroll
        // position naturally.
        setNextFetchLimit(saved.snapshot.offset || PAGE_SIZE_BACK);
      }
      setQuery(saved.query);
      setCategoryId(saved.categoryId);
      setRelatedToId(null);
      const scrollTop = saved.scrollTop;
      savedViewRef.current = null;

      // Schedule scroll restore after the new tracks render
      pendingBackScrollRef.current = scrollTop;

      persistView({
        relatedToId: null,
        categoryId: saved.categoryId,
        scrollTop,
        trackCount: hasSnapshot
          ? saved.snapshot.tracks.length
          : saved.snapshot.offset,
        previousCategoryId: null,
        previousScrollTop: 0,
        previousTrackCount: 0,
      });

      if (hasSnapshot) {
        // Tracks are already in memory — restore scroll immediately
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
      <div className="app-top">
        {relatedToId && (
          <SurfaceHeader
            title={intl.formatMessage({
              defaultMessage: "Similar music",
              description:
                "Header title shown when viewing tracks similar to one the user picked.",
            })}
            start={{
              ariaLabel: intl.formatMessage({
                defaultMessage: "Go back",
                description:
                  "Accessible label for the back button that returns from the similar-tracks view.",
              }),
              onClick: handleBack,
            }}
          />
        )}

        {!relatedToId && (
          <div className="app-controls">
            <div className="app-search-row">
              <div className="app-search-grow">
                <SearchBar onSearch={handleSearch} />
              </div>
              <LinksMenu />
            </div>
            {!query && (
              <CategoryList
                categories={categories}
                activeId={categoryId}
                loading={categoriesLoading}
                onSelect={handleCategorySelect}
              />
            )}
          </div>
        )}
      </div>

      <div className="app-content" ref={contentRef}>
        {!audioSupported ? (
          <Box paddingY="4u" paddingX="2u">
            <Text size="small" tone="secondary" alignment="center">
              <FormattedMessage
                defaultMessage="Audio tracks aren't supported in this design type. Try a presentation or video."
                description="Notice shown when the user opens the app in a design type that doesn't allow audio (e.g. a static image)."
              />
            </Text>
          </Box>
        ) : (
          <TrackList
            tracks={tracks}
            query={query}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onFindSimilar={handleFindSimilar}
          />
        )}
      </div>

      <Player />
    </div>
  );
}
