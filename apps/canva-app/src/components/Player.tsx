import { useCallback } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  Button,
  PauseIcon,
  PlayFilledIcon,
  PlusIcon,
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

/**
 * Shopping-bag "get a license" icon. The Kit has no cart/basket icon, so this
 * is a custom SVG (the "custom component" Canva allows where the Kit has no
 * counterpart). Outline style + 24px + currentColor so it matches the visual
 * weight, size, and color of the Kit icons (medium = 24px) in the same Button.
 */
function LicenseBagIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

/** Small "opens in a new tab" indicator (box with an arrow leaving the top
 * right), sized to sit inline with the tiny license attribution text. */
function ExternalLinkIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="ftu-np-license-ext"
    >
      <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z" />
      <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z" />
    </svg>
  );
}

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
            icon={() => <LicenseBagIcon />}
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
        <FormattedMessage
          defaultMessage="<b>{title} by {artist}</b> is licensed under the <link>Free To Use License</link>"
          description="License attribution line shown beneath the now-playing waveform. {title} by {artist} and the link text are bold; the link opens the Free To Use license page."
          values={{
            title: track.title,
            artist,
            b: (chunks) => <strong>{chunks}</strong>,
            link: (chunks) => (
              <button
                type="button"
                className="ftu-np-license-link"
                onClick={() =>
                  requestOpenExternalUrl({
                    url: "https://freetouse.com/license",
                  })
                }
              >
                {chunks}
                <ExternalLinkIcon />
              </button>
            ),
          }}
        />
      </div>
    </div>
  );
}
