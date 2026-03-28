import { useState, useCallback } from "react";
import { Rows, Alert } from "@canva/app-ui-kit";
import { useFeatureSupport } from "@canva/app-hooks";
import { addAudioTrack } from "@canva/design";
import { Header } from "../../components/Header";
import { SearchInput } from "../../components/SearchInput";
import { CategoryBar } from "../../components/CategoryBar";
import { TrackList } from "../../components/TrackList";
import { Footer } from "../../components/Footer";
import { useTracks } from "../../hooks/useTracks";
import "../../styles/app.css";

export function App() {
  const isSupported = useFeatureSupport();
  const audioSupported = isSupported(addAudioTrack);

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { tracks, categories, loading, hasMore, loadMore } = useTracks(
    query,
    categoryId
  );

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (q) setCategoryId(null);
  }, []);

  const handleCategorySelect = useCallback((id: string | null) => {
    setCategoryId(id);
    setQuery("");
  }, []);

  return (
    <Rows spacing="2u">
      <Header />

      {!audioSupported && (
        <Alert tone="warn">
          Audio tracks are not supported in this design type. Try a
          presentation or video.
        </Alert>
      )}

      <SearchInput onSearch={handleSearch} />

      {!query && (
        <CategoryBar
          categories={categories}
          activeId={categoryId}
          onSelect={handleCategorySelect}
        />
      )}

      <TrackList
        tracks={tracks}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />

      <Footer />
    </Rows>
  );
}
