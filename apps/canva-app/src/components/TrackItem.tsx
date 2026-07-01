import { useCallback, useRef } from "react";
import { useIntl } from "react-intl";
import {
  AudioCard,
  Button,
  PauseIcon,
  PlayFilledIcon,
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
  useNowPlayingControls,
  useNowPlayingTrack,
} from "../hooks/useNowPlaying";
import { useAttributionModal } from "../hooks/useAttributionModal";
import { getArtistNames } from "../utils/format";

/**
 * A tiny silent WAV. We feed this to the AudioCard's `audioPreviewUrl` instead
 * of the real mp3 because the card's own audio is never used — its play button
 * is hidden and playback runs through our seekable engine (which loads
 * `track.files.mp3` directly). The Kit card does `new Audio(audioPreviewUrl)`
 * with the browser default preload="auto", i.e. it downloads the FULL mp3 for
 * every card on mount; with ~20 cards remounted on every search that was
 * hundreds of MB of wasted, uncancelled downloads — the cause of the search
 * lag/near-crash. A data URI loads inline (no network) and keeps the card's
 * displayed duration (which comes from the durationInSeconds prop, not the
 * audio) intact.
 */
const SILENT_AUDIO =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

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
  const { registerCard, playTrack } = useNowPlayingControls();
  const { track: nowPlaying, isPlaying } = useNowPlayingTrack();
  const { showAttribution } = useAttributionModal();

  const artist = getArtistNames(track);
  const displayTitle = `${artist} – ${track.title}`;
  const tags = getTagLabels(track);
  const isActive = nowPlaying?.id === track.id;

  // Keep the latest track in a ref so the AudioCard callbacks can stay stable
  // (a changing handler identity would make AudioCard recreate its <audio>
  // element every render).
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
      resolveAudioRef: async () => {
        const result = await uploadAudio();
        showAttribution(track);
        return result;
      },
      durationMs: Math.round(track.duration * 1000),
      title: displayTitle,
    });
  };

  // Register/unregister this card's imperative ref so the player can silence
  // the card's Kit audio if it ever starts (see handlePlay).
  const setCardRef = useCallback(
    (ref: AudioCardRef | null) => registerCard(track.id, ref),
    [registerCard, track.id],
  );

  // Clicking the card body launches playback in the shared, seekable player:
  // `playTrack` toggles if this is already the active track, otherwise starts
  // it. The Kit AudioCard's own cover play button is hidden via CSS (app.css) —
  // using it would start the card's own unseekable audio and leave the Kit
  // stuck "playing-but-paused" (no stop() on AudioCardRef), freezing the card's
  // icon/progress ring. `onPlay` stays wired as a safety net: if a future Kit
  // version changes the hashed class and the button reappears, onPlay routes
  // that audio into playTrack (which silences the card and plays our seekable
  // element) instead of leaking uncontrolled Kit audio. Add-to-design is the +.
  const handlePlay = useCallback(() => {
    playTrack(trackRef.current);
  }, [playTrack]);

  const findSimilarLabel = intl.formatMessage({
    defaultMessage: "Find similar tracks",
    description:
      "Tooltip / accessible label for the button that shows tracks similar to this one.",
  });
  const addLabel = intl.formatMessage({
    defaultMessage: "Add to design",
    description:
      "Tooltip / accessible label for the button that adds the track to the design.",
  });

  return (
    // Flex row: the AudioCard flexes (and truncates its title/artist with an
    // ellipsis) while the action buttons reserve fixed space on the right, so
    // long titles/artists never run underneath the buttons. The buttons are
    // only revealed on hover/focus but their space is always reserved (no
    // layout shift). The wrapper also carries the "now playing" outline.
    <div className={`ftu-track${isActive ? " is-playing" : ""}`}>
      <div className="ftu-track-card">
      <AudioCard
        ref={setCardRef}
        title={track.title}
        description={artist}
        durationInSeconds={track.duration}
        audioPreviewUrl={SILENT_AUDIO}
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
        onClick={handlePlay}
        onDragStart={canAdd ? handleDragStart : undefined}
        content={
          tags.length > 0 ? (
            <Text size="xsmall" tone="tertiary" lineClamp={1}>
              {tags.join(", ")}
            </Text>
          ) : undefined
        }
        onPlay={handlePlay}
      />
      {/* Our own play/pause affordance over the cover (the Kit's built-in one
        * is hidden — see app.css). Shows on hover, and always for the active
        * track (pause while playing, play while paused). Purely visual:
        * pointer-events pass through to the card, which toggles playback. */}
      <span className="ftu-card-play" aria-hidden="true">
        {isActive && isPlaying ? <PauseIcon /> : <PlayFilledIcon />}
      </span>
      </div>
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
