import { useCallback } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  Button,
  Link,
  PauseIcon,
  PlayFilledIcon,
  PlusIcon,
  OpenInNewIcon,
  Text,
} from "@canva/app-ui-kit";
import { upload } from "@canva/asset";
import { addAudioTrack } from "@canva/design";
import { useFeatureSupport } from "@canva/app-hooks";
import { requestOpenExternalUrl } from "@canva/platform";
import {
  useNowPlayingControls,
  useNowPlayingState,
} from "../hooks/useNowPlaying";
import { useAttributionModal } from "../hooks/useAttributionModal";
import { Waveform } from "./Waveform";
import { formatDuration, getArtistNames, getLicenseUrl } from "../utils/format";

export function Player() {
  const intl = useIntl();
  const isSupported = useFeatureSupport();
  const canAdd = isSupported(addAudioTrack);
  const { toggleCurrent } = useNowPlayingControls();
  const { track, isPlaying, currentTime, duration } = useNowPlayingState();
  const { showAttribution } = useAttributionModal();

  const handleAddToDesign = useCallback(async () => {
    if (!track || !canAdd) return;
    const artist = getArtistNames(track);
    const asset = await upload({
      type: "audio",
      title: `${artist} – ${track.title}`,
      mimeType: "audio/mp3",
      durationMs: Math.round(track.duration * 1000),
      url: track.files.mp3,
      aiDisclosure: "none",
    });
    await addAudioTrack({ ref: asset.ref });
    showAttribution(track);
  }, [track, canAdd, showAttribution]);

  if (!track) return null;

  const artist = getArtistNames(track);
  const total = duration > 0 ? duration : track.duration;
  const progress = total > 0 ? currentTime / total : 0;

  return (
    <div className="ftu-np">
      <div className="ftu-np-bar">
        <button
          type="button"
          className="ftu-np-cover"
          onClick={toggleCurrent}
          aria-label={
            isPlaying
              ? intl.formatMessage({
                  defaultMessage: "Pause",
                  description: "Accessible label for the now-playing pause control.",
                })
              : intl.formatMessage({
                  defaultMessage: "Play",
                  description: "Accessible label for the now-playing play control.",
                })
          }
        >
          <img src={track.thumbnails.sm} alt="" />
          <span className="ftu-np-cover-overlay" aria-hidden="true">
            {isPlaying ? <PauseIcon /> : <PlayFilledIcon />}
          </span>
        </button>

        <div className="ftu-np-info">
          <Text size="small" lineClamp={1}>
            {track.title}
          </Text>
          <Text size="xsmall" tone="tertiary" lineClamp={1}>
            {formatDuration(currentTime)} / {formatDuration(total)} • {artist}
          </Text>
        </div>

        <div className="ftu-np-actions">
          <Button
            variant="tertiary"
            icon={() => <OpenInNewIcon />}
            ariaLabel={intl.formatMessage({
              defaultMessage: "Get a license",
              description:
                "Accessible label for the button that opens the commercial license page for the playing track.",
            })}
            tooltipLabel={intl.formatMessage({
              defaultMessage: "Get a license",
              description: "Tooltip for the license button.",
            })}
            onClick={() => requestOpenExternalUrl({ url: getLicenseUrl(track) })}
          />
          {canAdd && (
            <Button
              variant="tertiary"
              icon={() => <PlusIcon />}
              ariaLabel={intl.formatMessage({
                defaultMessage: "Add to design",
                description:
                  "Accessible label for the button that adds the playing track to the design.",
              })}
              tooltipLabel={intl.formatMessage({
                defaultMessage: "Add to design",
                description: "Tooltip for the add-to-design button.",
              })}
              onClick={handleAddToDesign}
            />
          )}
        </div>
      </div>

      <Waveform data={track.waveform} progress={progress} />

      <div className="ftu-np-license">
        <Text size="xsmall" tone="tertiary">
          <FormattedMessage
            defaultMessage="{title} by {artist} is licensed under the <link>Free To Use License</link>"
            description="License attribution line shown beneath the now-playing waveform. The link opens the Free To Use license page."
            values={{
              title: track.title,
              artist,
              link: (chunks) => (
                <Link
                  href="https://freetouse.com/license"
                  requestOpenExternalUrl={() =>
                    requestOpenExternalUrl({
                      url: "https://freetouse.com/license",
                    })
                  }
                  ariaLabel={intl.formatMessage({
                    defaultMessage: "Open the Free To Use License",
                    description:
                      "Accessible label for the license link in the attribution line.",
                  })}
                >
                  {chunks}
                </Link>
              ),
            }}
          />
        </Text>
      </div>
    </div>
  );
}
