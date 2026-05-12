import { useCallback } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import type { Track, TrackCategory } from "@freetouse/api";
import { upload } from "@canva/asset";
import { addAudioTrack, ui } from "@canva/design";
import { useFeatureSupport } from "@canva/app-hooks";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useAttributionModal } from "../hooks/useAttributionModal";
import { getArtistNames } from "../utils/format";

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function getTagLabels(track: Track): string[] {
  return track.tags_categories.slice(0, 2).map(([, item]) => {
    const name =
      typeof item === "string" ? item : (item as TrackCategory).name;
    return capitalize(name);
  });
}

interface TrackItemProps {
  track: Track;
  /** The full visible track list — used as the autoplay queue when the user
   * starts this track (so the next track auto-plays when this one ends). */
  queue: Track[];
  onFindSimilar: (trackId: string) => void;
}

export function TrackItem({ track, queue, onFindSimilar }: TrackItemProps) {
  const intl = useIntl();
  const isSupported = useFeatureSupport();
  const canAdd = isSupported(addAudioTrack);
  const player = useAudioPlayer();
  const { showAttribution } = useAttributionModal();

  const artist = getArtistNames(track);
  const displayTitle = `${artist} – ${track.title}`;
  const tags = getTagLabels(track);
  const isActive = player.isCurrent(track.id);

  const uploadAudio = useCallback(
    () =>
      upload({
        type: "audio",
        title: displayTitle,
        mimeType: "audio/mp3",
        durationMs: Math.round(track.duration * 1000),
        url: track.files.mp3,
        aiDisclosure: "none",
      }),
    [displayTitle, track.duration, track.files.mp3],
  );

  const handleAddToDesign = useCallback(async () => {
    if (!canAdd) return;
    const asset = await uploadAudio();
    await addAudioTrack({ ref: asset.ref });
    showAttribution(track);
  }, [canAdd, uploadAudio, showAttribution, track]);

  const handleClick = () => {
    player.toggle(track, queue);
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canAdd) return;
    ui.startDragToPoint(event, {
      type: "audio",
      // Wrap the upload so we can show the attribution modal as soon as
      // Canva resolves the asset (i.e. the user successfully dropped the
      // track into their design).
      resolveAudioRef: async () => {
        const result = await uploadAudio();
        showAttribution(track);
        return result;
      },
      durationMs: Math.round(track.duration * 1000),
      title: displayTitle,
    });
  };

  return (
    <div
      className={`track-item ${isActive ? "active" : ""}`}
      onClick={handleClick}
      draggable={canAdd}
      onDragStart={canAdd ? handleDragStart : undefined}
      role="button"
      tabIndex={0}
      aria-label={intl.formatMessage(
        {
          defaultMessage: "Play preview of {title}",
          description:
            "Accessible label for the track row; clicking it plays a preview of the track.",
        },
        { title: track.title },
      )}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <img
        className="track-item-cover"
        src={track.thumbnails.sm}
        alt=""
        loading="lazy"
        draggable={false}
      />
      <div className="track-item-info">
        <div className="track-item-title" title={track.title}>
          {track.title}
        </div>
        <div className="track-item-artist" title={artist}>
          {artist}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="track-item-tags">
          {tags.map((tag) => (
            <span key={tag} className="track-item-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="track-item-actions">
        <button
          type="button"
          className="track-action-btn track-action-btn--text"
          onClick={(e) => {
            e.stopPropagation();
            onFindSimilar(track.id);
          }}
        >
          <span className="track-action-btn-content">
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"
              />
            </svg>
            <FormattedMessage
              defaultMessage="Find Similar"
              description="Hover action on a track that opens a list of tracks similar to it."
            />
          </span>
        </button>
        {canAdd && (
          <button
            type="button"
            className="track-action-btn track-action-btn--icon"
            title={intl.formatMessage({
              defaultMessage: "Add",
              description:
                "Tooltip on the icon button that adds the track to the user's Canva design.",
            })}
            aria-label={intl.formatMessage(
              {
                defaultMessage: "Add {title} to design",
                description:
                  "Accessible label for the icon button that adds a specific track to the user's design.",
              },
              { title: displayTitle },
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleAddToDesign();
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm6.5 4.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3a.5.5 0 0 1 1 0z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
