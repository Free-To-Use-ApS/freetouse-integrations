import { useCallback, useRef } from "react";
import { useIntl } from "react-intl";
import {
  AudioCard,
  Button,
  PlusIcon,
  SearchIcon,
  Text,
  type AudioCardRef,
} from "@canva/app-ui-kit";
import type { Track, TrackCategory } from "@freetouse/api";
import { upload } from "@canva/asset";
import { addAudioTrack, ui } from "@canva/design";
import { useFeatureSupport } from "@canva/app-hooks";
import {
  useActiveTrackId,
  useNowPlayingControls,
} from "../hooks/useNowPlaying";
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
  onFindSimilar: (trackId: string) => void;
}

export function TrackItem({ track, onFindSimilar }: TrackItemProps) {
  const intl = useIntl();
  const isSupported = useFeatureSupport();
  const canAdd = isSupported(addAudioTrack);
  const {
    registerCard,
    onCardPlay,
    onCardPause,
    onCardTimeUpdate,
    onCardEnded,
  } = useNowPlayingControls();
  const activeTrackId = useActiveTrackId();
  const { showAttribution } = useAttributionModal();

  const artist = getArtistNames(track);
  const displayTitle = `${artist} – ${track.title}`;
  const tags = getTagLabels(track);
  const isActive = activeTrackId === track.id;

  // Keep the latest track + this card's ref + playing flag in refs so the
  // AudioCard callbacks can stay stable (a changing onEnded identity would
  // make AudioCard recreate its <audio> element every render).
  const trackRef = useRef(track);
  trackRef.current = track;
  const cardRef = useRef<AudioCardRef | null>(null);
  const playingRef = useRef(false);

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

  const handleDragStart = (event: React.DragEvent<HTMLElement>) => {
    if (!canAdd) return;
    ui.startDragToPoint(event, {
      type: "audio",
      resolveAudioRef: async () => {
        const result = await uploadAudio();
        showAttribution(track);
        return result;
      },
      durationMs: Math.round(track.duration * 1000),
      title: displayTitle,
    });
  };

  // Register/unregister this card's imperative ref (stable).
  const setCardRef = useCallback(
    (ref: AudioCardRef | null) => {
      cardRef.current = ref;
      registerCard(track.id, ref);
    },
    [registerCard, track.id],
  );

  // Clicking the card body toggles playback (per product preference). The
  // built-in cover play button also works; add-to-design is the + button.
  const handleCardClick = useCallback(() => {
    if (playingRef.current) cardRef.current?.pause();
    else cardRef.current?.play();
  }, []);

  // Stable AudioCard callbacks (read latest track via ref).
  const handlePlay = useCallback(
    (t: number) => {
      playingRef.current = true;
      onCardPlay(trackRef.current, t);
    },
    [onCardPlay],
  );
  const handlePause = useCallback(
    (t: number) => {
      playingRef.current = false;
      onCardPause(trackRef.current, t);
    },
    [onCardPause],
  );
  const handleTimeUpdate = useCallback(
    (t: number) => onCardTimeUpdate(trackRef.current, t),
    [onCardTimeUpdate],
  );
  const handleEnded = useCallback(() => {
    playingRef.current = false;
    onCardEnded(trackRef.current);
  }, [onCardEnded]);

  const findSimilarLabel = intl.formatMessage(
    {
      defaultMessage: "Find tracks similar to {title}",
      description:
        "Accessible label for the button that shows tracks similar to this one.",
    },
    { title: track.title },
  );
  const addLabel = intl.formatMessage(
    {
      defaultMessage: "Add {title} to design",
      description:
        "Accessible label for the button that adds the track to the design.",
    },
    { title: track.title },
  );

  return (
    // Wrapper provides the purple "now playing" outline + hosts the hover
    // action buttons. AudioCard's own decorator slots only allow corner
    // placement, so the two side-by-side actions from Canva's mock are a
    // custom overlay of Kit Buttons on the right edge (shown on hover).
    <div className={`ftu-track${isActive ? " is-playing" : ""}`}>
      <AudioCard
        ref={setCardRef}
        title={track.title}
        description={artist}
        durationInSeconds={track.duration}
        audioPreviewUrl={track.files.mp3}
        thumbnailUrl={track.thumbnails.sm}
        ariaLabel={intl.formatMessage(
          {
            defaultMessage: "Play preview of {title}",
            description:
              "Accessible label for the track card; clicking the card plays a preview.",
          },
          { title: track.title },
        )}
        disabled={!canAdd}
        onClick={handleCardClick}
        onDragStart={canAdd ? handleDragStart : undefined}
        content={
          tags.length > 0 ? (
            <Text size="xsmall" tone="tertiary">
              {tags.join(", ")}
            </Text>
          ) : undefined
        }
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
      <div className="ftu-track-actions">
        <Button
          variant="secondary"
          icon={() => <SearchIcon />}
          ariaLabel={findSimilarLabel}
          tooltipLabel={findSimilarLabel}
          onClick={(e) => {
            e.stopPropagation?.();
            onFindSimilar(track.id);
          }}
        />
        {canAdd && (
          <Button
            variant="secondary"
            icon={() => <PlusIcon />}
            ariaLabel={addLabel}
            tooltipLabel={addLabel}
            onClick={(e) => {
              e.stopPropagation?.();
              handleAddToDesign();
            }}
          />
        )}
      </div>
    </div>
  );
}
