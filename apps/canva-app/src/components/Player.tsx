import { useCallback } from "react";
import { FormattedMessage, useIntl } from "react-intl";
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
  const intl = useIntl();
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
          aria-label={intl.formatMessage(
            {
              defaultMessage: "Open {title} on freetouse.com",
              description:
                "Accessible label for the player's cover image; clicking opens the track's page on freetouse.com.",
            },
            { title: track.title },
          )}
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
          aria-label={
            isPlaying
              ? intl.formatMessage({
                  defaultMessage: "Pause",
                  description:
                    "Accessible label for the pause button in the player bar.",
                })
              : intl.formatMessage({
                  defaultMessage: "Play",
                  description:
                    "Accessible label for the play button in the player bar.",
                })
          }
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
            title={intl.formatMessage({
              defaultMessage: "Add",
              description:
                "Tooltip on the player bar button that adds the current track to the user's Canva design.",
            })}
            aria-label={intl.formatMessage({
              defaultMessage: "Add to design",
              description:
                "Accessible label for the player bar button that adds the current track to the user's Canva design.",
            })}
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
          title={intl.formatMessage({
            defaultMessage: "Purchase License",
            description:
              "Tooltip on the player bar button that opens the commercial license purchase page for the current track.",
          })}
          aria-label={intl.formatMessage({
            defaultMessage: "Purchase License",
            description:
              "Accessible label for the player bar button that opens the commercial license purchase page.",
          })}
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
        <FormattedMessage
          defaultMessage="<b>{title}</b> <b>by</b> <b>{artist}</b> is licensed under the <link><b>Free To Use License</b></link>"
          description="License attribution shown below the waveform in the player bar. {title} and {artist} are filled in; the link opens the Free To Use license page."
          values={{
            title: track.title,
            artist,
            b: (chunks) => <strong>{chunks}</strong>,
            link: (chunks) => (
              <button
                type="button"
                className="player-license-link"
                onClick={() =>
                  requestOpenExternalUrl({
                    url: "https://freetouse.com/license",
                  })
                }
              >
                {chunks}
              </button>
            ),
          }}
        />
      </div>
    </div>
  );
}
