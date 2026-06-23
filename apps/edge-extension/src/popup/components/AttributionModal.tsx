import { useState } from "react";
import type { Track } from "@freetouse/api";

interface AttributionModalProps {
  track: Track;
  onClose: () => void;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildLines(track: Track): string[] {
  const title = track.title;
  const artist = track.artists.map(([, a]) => a.name).join(", ");
  const artistSlug = slugify(track.artists[0]?.[1]?.name ?? "");
  const titleSlug = slugify(track.title);
  const url = `https://freetouse.com/music/${artistSlug}/${titleSlug}`;

  return [
    `Music track: ${title} by ${artist}`,
    `Source: https://freetouse.com/music`,
  ];
}

export function AttributionModal({ track, onClose }: AttributionModalProps) {
  const [copied, setCopied] = useState(false);
  const lines = buildLines(track);
  const artist = track.artists.map(([, a]) => a.name).join(", ");

  function handleCopy() {
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="attribution-backdrop" onClick={onClose}>
      <div className="attribution-modal" onClick={(e) => e.stopPropagation()}>
        <div className="attribution-header">
          <span className="attribution-title">Attribution is required</span>
          <button className="attribution-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <p className="attribution-description">
          <em><strong>{track.title} by {artist}</strong></em> is free to use in non-commercial
          content as long as you provide attribution in your video description.
        </p>
        <div className="attribution-box">
          <div className="attribution-lines">
            {lines.map((line) => (
              <span key={line} className="attribution-line">{line}</span>
            ))}
          </div>
          <button
            className={`attribution-copy-icon ${copied ? "copied" : ""}`}
            onClick={handleCopy}
            title="Copy"
          >
            {copied ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
