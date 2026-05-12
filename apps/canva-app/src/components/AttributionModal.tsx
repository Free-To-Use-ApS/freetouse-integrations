import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
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

  // Close on Escape key for keyboard accessibility
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
        // Clipboard write may fail in some browser permission contexts —
        // silently ignore; the user can still copy manually.
      });
  };

  return (
    <div
      className="attribution-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="attribution-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attribution-title"
      >
        <div className="attribution-header">
          <span id="attribution-title" className="attribution-title">
            <FormattedMessage
              defaultMessage="Attribution is required"
              description="Title of the modal shown after a track is added to the design, reminding the user to credit the music."
            />
          </span>
          <button
            type="button"
            className="attribution-close"
            onClick={onClose}
            aria-label={intl.formatMessage({
              defaultMessage: "Close",
              description: "Accessible label for the modal's close button.",
            })}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
        <p className="attribution-description">
          <FormattedMessage
            defaultMessage="<emph>{title} by {artist}</emph> is free to use in non-commercial content as long as you provide attribution."
            description="Body text of the attribution modal explaining the user's licensing obligation."
            values={{
              title: track.title,
              artist,
              emph: (chunks) => (
                <em>
                  <strong>{chunks}</strong>
                </em>
              ),
            }}
          />
        </p>
        <div className="attribution-box">
          <div className="attribution-lines">
            {lines.map((line) => (
              <span key={line} className="attribution-line">
                {line}
              </span>
            ))}
          </div>
          <button
            type="button"
            className={`attribution-copy-icon ${copied ? "copied" : ""}`}
            onClick={handleCopy}
            title={
              copied
                ? intl.formatMessage({
                    defaultMessage: "Copied!",
                    description:
                      "Tooltip on the copy button right after a successful copy.",
                  })
                : intl.formatMessage({
                    defaultMessage: "Copy",
                    description:
                      "Tooltip on the button that copies the attribution text to the clipboard.",
                  })
            }
            aria-label={
              copied
                ? intl.formatMessage({
                    defaultMessage: "Copied",
                    description:
                      "Accessible label on the copy button right after a successful copy.",
                  })
                : intl.formatMessage({
                    defaultMessage: "Copy attribution",
                    description:
                      "Accessible label on the button that copies the attribution text to the clipboard.",
                  })
            }
          >
            {copied ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
