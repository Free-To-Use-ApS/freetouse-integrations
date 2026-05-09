import { useCallback } from "react";
import { upload } from "@canva/asset";
import { addAudioTrack } from "@canva/design";
import { useFeatureSupport } from "@canva/app-hooks";
import { requestOpenExternalUrl } from "@canva/platform";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useAttributionModal } from "../hooks/useAttributionModal";
import { Waveform } from "./Waveform";
import {
  formatDuration,
  getArtistNames,
  getArtistUrl,
  getLicenseUrl,
  getTrackUrl,
} from "../utils/format";

export function Player() {
  const isSupported = useFeatureSupport();
  const canAdd = isSupported(addAudioTrack);
  const player = useAudioPlayer();
  const { showAttribution } = useAttributionModal();
  const { track, isPlaying, currentTime, duration, pause, resume, seek } =
    player;

  const handleSeek = useCallback(
    (fraction: number) => {
      if (duration > 0) {
        seek(fraction * duration);
        if (!isPlaying) resume();
      }
    },
    [duration, seek, isPlaying, resume],
  );

  const handleAddToDesign = useCallback(async () => {
    if (!track || !canAdd) return;
    const artist = getArtistNames(track);
    const displayTitle = `${artist} – ${track.title}`;
    const asset = await upload({
      type: "audio",
      title: displayTitle,
      mimeType: "audio/mp3",
      durationMs: Math.round(track.duration * 1000),
      url: track.files.mp3,
      aiDisclosure: "none",
    });
    await addAudioTrack({ ref: asset.ref });
    showAttribution(track);
  }, [track, canAdd, showAttribution]);

  if (!track) return null;

  const progress = duration > 0 ? currentTime / duration : 0;
  const artist = getArtistNames(track);
  const trackUrl = getTrackUrl(track);

  const openTrackPage = () => requestOpenExternalUrl({ url: trackUrl });

  return (
    <div className="app-player">
      <div className="player-bar">
        <button
          type="button"
          className="player-bar-cover-btn"
          onClick={openTrackPage}
          aria-label={`Open ${track.title} on freetouse.com`}
        >
          <img
            className="player-bar-cover"
            src={track.thumbnails.sm}
            alt=""
          />
        </button>
        <div className="player-bar-info">
          <button
            type="button"
            className="player-bar-title player-bar-link"
            title={track.title}
            onClick={openTrackPage}
          >
            {track.title}
          </button>
          <div className="player-bar-artist" title={artist}>
            {track.artists.map(([, a], idx) => (
              <span key={a.id ?? a.name}>
                {idx > 0 && ", "}
                <button
                  type="button"
                  className="player-bar-link"
                  onClick={() =>
                    requestOpenExternalUrl({ url: getArtistUrl(a.name) })
                  }
                >
                  {a.name}
                </button>
              </span>
            ))}
          </div>
        </div>
        <span className="player-bar-time">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
        <button
          type="button"
          className={`player-bar-btn ${isPlaying ? "playing" : ""}`}
          onClick={() => (isPlaying ? pause() : resume())}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        {canAdd && (
          <button
            type="button"
            className="player-bar-btn"
            title="Add to design"
            aria-label="Add to design"
            onClick={handleAddToDesign}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.5 4.5a.5.5 0 0 0-1 0v3h-3a.5.5 0 0 0 0 1h3v3a.5.5 0 0 0 1 0v-3h3a.5.5 0 0 0 0-1h-3z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="player-bar-btn"
          title="Purchase License"
          aria-label="Purchase License"
          onClick={() =>
            requestOpenExternalUrl({ url: getLicenseUrl(track) })
          }
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ marginBottom: "2px" }}
            aria-hidden="true"
          >
            <path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1m3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4z" />
          </svg>
        </button>
      </div>
      <Waveform
        data={track.waveform}
        progress={progress}
        onSeek={handleSeek}
      />
      <div className="player-license">
        <strong>{track.title}</strong> <strong>by</strong>{" "}
        <strong>{artist}</strong> is licensed under the{" "}
        <button
          type="button"
          className="player-license-link"
          onClick={() =>
            requestOpenExternalUrl({ url: "https://freetouse.com/license" })
          }
        >
          <strong>Free To Use License</strong>
        </button>
      </div>
    </div>
  );
}
