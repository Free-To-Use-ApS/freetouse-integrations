import { Rows, Button, LoadingIndicator, Text } from "@canva/app-ui-kit";
import type { Track } from "@freetouse/api";
import { TrackCard } from "./TrackCard";

interface TrackListProps {
  tracks: Track[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function TrackList({
  tracks,
  loading,
  hasMore,
  onLoadMore,
}: TrackListProps) {
  if (loading && tracks.length === 0) {
    return (
      <Rows spacing="2u">
        <LoadingIndicator />
      </Rows>
    );
  }

  if (!loading && tracks.length === 0) {
    return (
      <Rows spacing="1u">
        <Text alignment="center">No tracks found.</Text>
      </Rows>
    );
  }

  return (
    <Rows spacing="1u">
      {tracks.map((track) => (
        <TrackCard key={track.id} track={track} />
      ))}
      {hasMore && (
        <Button
          variant="secondary"
          onClick={onLoadMore}
          loading={loading}
          stretch
        >
          Load more
        </Button>
      )}
    </Rows>
  );
}
