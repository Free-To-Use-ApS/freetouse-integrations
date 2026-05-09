import type { Track } from "@freetouse/api";
import { requestOpenExternalUrl } from "@canva/platform";
import { TrackItem } from "./TrackItem";

function SkeletonItem() {
  return (
    <div className="track-item skeleton-item">
      <div className="skeleton skeleton-cover" />
      <div className="track-item-info">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-artist" />
      </div>
      <div className="skeleton-tags">
        <div className="skeleton skeleton-tag" />
        <div className="skeleton skeleton-tag skeleton-tag--short" />
      </div>
    </div>
  );
}

function SkeletonList({ count = 12 }: { count?: number }) {
  return (
    <div className="track-list" aria-busy="true" aria-label="Loading tracks">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonItem key={i} />
      ))}
    </div>
  );
}

interface TrackListProps {
  tracks: Track[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onFindSimilar: (trackId: string) => void;
}

export function TrackList({
  tracks,
  loading,
  hasMore,
  onLoadMore,
  onFindSimilar,
}: TrackListProps) {
  const openLink = (url: string) => {
    requestOpenExternalUrl({ url });
  };

  if (tracks.length === 0 && loading) {
    return <SkeletonList />;
  }

  if (tracks.length === 0) {
    return <p className="loading-text">No tracks found</p>;
  }

  return (
    <div className="track-list">
      {tracks.map((track) => (
        <TrackItem
          key={track.id}
          track={track}
          queue={tracks}
          onFindSimilar={onFindSimilar}
        />
      ))}
      {loading && <p className="loading-text">Loading...</p>}
      {hasMore && !loading && (
        <button
          type="button"
          className="load-more-btn"
          onClick={onLoadMore}
        >
          Load more
        </button>
      )}
      <div className="track-list-footer">
        <button
          type="button"
          className="footer-link"
          onClick={() => openLink("https://freetouse.com/music/plans")}
        >
          Subscription Plans
        </button>
        <span className="footer-divider">·</span>
        <button
          type="button"
          className="footer-link"
          onClick={() => openLink("https://freetouse.com/usage-policy")}
        >
          Usage Policy
        </button>
        <span className="footer-divider">·</span>
        <button
          type="button"
          className="footer-link"
          onClick={() => openLink("https://freetouse.com/faq")}
        >
          FAQ
        </button>
        <span className="footer-divider">·</span>
        <button
          type="button"
          className="footer-link"
          onClick={() => openLink("https://freetouse.com/blog")}
        >
          Blog
        </button>
      </div>
    </div>
  );
}
