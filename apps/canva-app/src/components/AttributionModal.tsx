import { useEffect, useState } from "react";
import type { Track } from "@freetouse/api";
import { getArtistNames } from "../utils/format";

interface AttributionModalProps {
  track: Track;
  onClose: () => void;
}

function buildLines(track: Track): string[] {
  const artist = getArtistNames(track);
  return [
    `Music track: ${track.title} by ${artist}`,
    `Source: https://freetouse.com/music`,
  ];
}

export function AttributionModal({ track, onClose }: AttributionModalProps) {
  const [copied, setCopied] = useState(false);
  const lines = buildLines(track);
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
            Attribution is required
          </span>
          <button
            type="button"
            className="attribution-close"
            onClick={onClose}
            aria-label="Close"
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
          <em>
            <strong>
              {track.title} by {artist}
            </strong>
          </em>{" "}
          is free to use in non-commercial content as long as you provide
          attribution.
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
            title={copied ? "Copied!" : "Copy"}
            aria-label={copied ? "Copied" : "Copy attribution"}
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
