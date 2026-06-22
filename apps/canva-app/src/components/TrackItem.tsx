import { useCallback, useRef } from "react";
import { useIntl } from "react-intl";
import { AudioCard, Text, SearchIcon, type AudioCardRef } from "@canva/app-ui-kit";
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

  // Keep the latest track in a ref so the AudioCard callbacks can stay stable
  // (a changing onEnded identity would make AudioCard recreate its <audio>).
  const trackRef = useRef(track);
  trackRef.current = track;

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
      // Show the attribution modal as soon as Canva resolves the asset
      // (i.e. the user successfully dropped the track into their design).
      resolveAudioRef: async () => {
        const result = await uploadAudio();
        showAttribution(track);
        return result;
      },
      durationMs: Math.round(track.duration * 1000),
      title: displayTitle,
    });
  };

  // Register/unregister this card's imperative ref so the bottom waveform bar
  // and autoplay can control playback. registerCard is stable.
  const setCardRef = useCallback(
    (ref: AudioCardRef | null) => registerCard(track.id, ref),
    [registerCard, track.id],
  );

  // Stable AudioCard callbacks (read the latest track via ref) so the card's
  // internal effects never re-run and never recreate the audio element.
  const handlePlay = useCallback(
    (t: number) => onCardPlay(trackRef.current, t),
    [onCardPlay],
  );
  const handlePause = useCallback(
    (t: number) => onCardPause(trackRef.current, t),
    [onCardPause],
  );
  const handleTimeUpdate = useCallback(
    (t: number) => onCardTimeUpdate(trackRef.current, t),
    [onCardTimeUpdate],
  );
  const handleEnded = useCallback(
    () => onCardEnded(trackRef.current),
    [onCardEnded],
  );

  return (
    // Wrapper provides the purple "now playing" outline from Canva's mock —
    // AudioCard itself has no playing-border prop.
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
            defaultMessage: "Add {title} to design",
            description:
              "Accessible label for the track card; clicking the card adds the track to the design.",
          },
          { title: displayTitle },
        )}
        disabled={!canAdd}
        onClick={handleAddToDesign}
        onDragStart={canAdd ? handleDragStart : undefined}
        content={
          tags.length > 0 ? (
            <Text size="small" tone="tertiary">
              {tags.join(" • ")}
            </Text>
          ) : undefined
        }
        topEnd={{
          buttonIcon: () => <SearchIcon />,
          buttonAriaLabel: intl.formatMessage(
            {
              defaultMessage: "Find tracks similar to {title}",
              description:
                "Accessible label for the icon button that shows tracks similar to this one.",
            },
            { title: track.title },
          ),
          buttonOnClick: () => onFindSimilar(track.id),
        }}
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
    </div>
  );
}
