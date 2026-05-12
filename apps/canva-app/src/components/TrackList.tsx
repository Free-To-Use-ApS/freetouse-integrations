import { FormattedMessage, useIntl } from "react-intl";
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
  const intl = useIntl();
  return (
    <div
      className="track-list"
      aria-busy="true"
      aria-label={intl.formatMessage({
        defaultMessage: "Loading tracks",
        description:
          "Accessible label shown while the list of music tracks is loading.",
      })}
    >
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
    return (
      <p className="loading-text">
        <FormattedMessage
          defaultMessage="No tracks found"
          description="Message shown when a search or category returns no tracks."
        />
      </p>
    );
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
      {loading && (
        <p className="loading-text">
          <FormattedMessage
            defaultMessage="Loading..."
            description="Status text shown while more tracks are being fetched after the user clicks 'Load more'."
          />
        </p>
      )}
      {hasMore && !loading && (
        <button type="button" className="load-more-btn" onClick={onLoadMore}>
          <FormattedMessage
            defaultMessage="Load more"
            description="Label on the button that loads the next page of tracks."
          />
        </button>
      )}
      <div className="track-list-footer">
        <button
          type="button"
          className="footer-link"
          onClick={() => openLink("https://freetouse.com/music/plans")}
        >
          <FormattedMessage
            defaultMessage="Subscription Plans"
            description="Footer link to the Free To Use subscription plans page."
          />
        </button>
        <span className="footer-divider">·</span>
        <button
          type="button"
          className="footer-link"
          onClick={() => openLink("https://freetouse.com/usage-policy")}
        >
          <FormattedMessage
            defaultMessage="Usage Policy"
            description="Footer link to the Free To Use usage policy page."
          />
        </button>
        <span className="footer-divider">·</span>
        <button
          type="button"
          className="footer-link"
          onClick={() => openLink("https://freetouse.com/faq")}
        >
          <FormattedMessage
            defaultMessage="FAQ"
            description="Footer link to the Free To Use FAQ page."
          />
        </button>
        <span className="footer-divider">·</span>
        <button
          type="button"
          className="footer-link"
          onClick={() => openLink("https://freetouse.com/blog")}
        >
          <FormattedMessage
            defaultMessage="Blog"
            description="Footer link to the Free To Use blog."
          />
        </button>
      </div>
    </div>
  );
}
