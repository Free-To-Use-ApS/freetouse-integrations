import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  Button,
  CheckIcon,
  CopyIcon,
  Rows,
  Text,
  Title,
  XIcon,
} from "@canva/app-ui-kit";
import type { Track } from "@freetouse/api";
import { getArtistNames } from "../utils/format";

interface AttributionModalProps {
  track: Track;
  onClose: () => void;
}

function buildLines(
  track: Track,
  intl: ReturnType<typeof useIntl>,
): string[] {
  const artist = getArtistNames(track);
  return [
    intl.formatMessage(
      {
        defaultMessage: "Music track: {title} by {artist}",
        description:
          "First line of the attribution text the user copies into their content.",
      },
      { title: track.title, artist },
    ),
    intl.formatMessage({
      defaultMessage: "Source: https://freetouse.com/music",
      description:
        "Second line of the attribution text — the source URL of the music library.",
    }),
  ];
}

export function AttributionModal({ track, onClose }: AttributionModalProps) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);
  const lines = buildLines(track, intl);
  const artist = getArtistNames(track);

  // Close on Escape for keyboard accessibility.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard may be blocked by permissions — ignore */
      });
  };

  return (
    <div className="ftu-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="ftu-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={intl.formatMessage({
          defaultMessage: "Attribution is required",
          description: "Accessible label for the attribution dialog.",
        })}
      >
        <Rows spacing="1.5u">
          <div className="ftu-modal-header">
            <Title size="small">
              <FormattedMessage
                defaultMessage="Attribution is required"
                description="Title of the modal shown after a track is added, reminding the user to credit the music."
              />
            </Title>
            <Button
              variant="tertiary"
              icon={() => <XIcon />}
              ariaLabel={intl.formatMessage({
                defaultMessage: "Close",
                description: "Accessible label for the modal's close button.",
              })}
              onClick={onClose}
            />
          </div>

          <Text size="small" tone="secondary">
            <FormattedMessage
              defaultMessage="{title} by {artist} is free to use in non-commercial content as long as you provide attribution."
              description="Body text of the attribution modal explaining the user's licensing obligation."
              values={{ title: track.title, artist }}
            />
          </Text>

          <div className="ftu-attribution-box">
            <div className="ftu-attribution-lines">
              {lines.map((line) => (
                <Text key={line} size="small">
                  {line}
                </Text>
              ))}
            </div>
            <Button
              variant="tertiary"
              icon={() => (copied ? <CheckIcon /> : <CopyIcon />)}
              ariaLabel={
                copied
                  ? intl.formatMessage({
                      defaultMessage: "Copied",
                      description:
                        "Accessible label on the copy button right after a successful copy.",
                    })
                  : intl.formatMessage({
                      defaultMessage: "Copy attribution",
                      description:
                        "Accessible label on the button that copies the attribution text.",
                    })
              }
              tooltipLabel={
                copied
                  ? intl.formatMessage({
                      defaultMessage: "Copied!",
                      description: "Tooltip after a successful copy.",
                    })
                  : intl.formatMessage({
                      defaultMessage: "Copy",
                      description: "Tooltip on the copy button.",
                    })
              }
              onClick={handleCopy}
            />
          </div>
        </Rows>
      </div>
    </div>
  );
}
