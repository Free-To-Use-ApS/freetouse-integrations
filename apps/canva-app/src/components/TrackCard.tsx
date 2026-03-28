import { AudioCard } from "@canva/app-ui-kit";
import { upload } from "@canva/asset";
import { addAudioTrack, ui } from "@canva/design";
import { useFeatureSupport } from "@canva/app-hooks";
import type { Track } from "@freetouse/api";
import { getArtistNames } from "../utils/format";

interface TrackCardProps {
  track: Track;
}

export function TrackCard({ track }: TrackCardProps) {
  const isSupported = useFeatureSupport();
  const canAdd = isSupported(addAudioTrack);

  const title = track.title;
  const artist = getArtistNames(track);
  const displayTitle = `${artist} – ${title}`;

  const uploadAudio = () =>
    upload({
      type: "audio",
      title: displayTitle,
      mimeType: "audio/mp3",
      durationMs: Math.round(track.duration * 1000),
      url: track.files.mp3,
      aiDisclosure: "none",
    });

  const handleClick = async () => {
    if (!canAdd) return;
    const asset = await uploadAudio();
    await addAudioTrack({ ref: asset.ref });
  };

  const handleDragStart = (event: React.DragEvent<HTMLElement>) => {
    ui.startDragToPoint(event, {
      type: "audio",
      resolveAudioRef: uploadAudio,
      durationMs: Math.round(track.duration * 1000),
      title: displayTitle,
    });
  };

  return (
    <AudioCard
      audioPreviewUrl={track.files.mp3}
      durationInSeconds={track.duration}
      title={displayTitle}
      description={artist}
      onDragStart={handleDragStart}
      onClick={handleClick}
      disabled={!canAdd}
      ariaLabel={`Add ${displayTitle} to design`}
    />
  );
}
