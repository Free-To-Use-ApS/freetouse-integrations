import type { Track } from "@freetouse/api";
import { TrackItem } from "./TrackItem.js";

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

function SkeletonList({ count = 8 }: { count?: number }) {
  return (
    <div className="track-list">
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

export function TrackList({ tracks, loading, hasMore, onLoadMore, onFindSimilar }: TrackListProps) {
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
        <button className="load-more-btn" onClick={onLoadMore}>
          Load more
        </button>
      )}
      <div className="track-list-footer">
        <a href="https://freetouse.com/music/plans" target="_blank" rel="noreferrer" className="footer-link">Subscription Plans</a>
        <span className="footer-divider">·</span>
        <a href="https://freetouse.com/usage-policy" target="_blank" rel="noreferrer" className="footer-link">Usage Policy</a>
        <span className="footer-divider">·</span>
        <a href="https://freetouse.com/faq" target="_blank" rel="noreferrer" className="footer-link">FAQ</a>
        <span className="footer-divider">·</span>
        <a href="https://freetouse.com/blog" target="_blank" rel="noreferrer" className="footer-link">Blog</a>
      </div>
    </div>
  );
}
