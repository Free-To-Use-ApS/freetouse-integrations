import { useCallback } from "react";
import type { Track } from "@freetouse/api";
import { usePlayer } from "../hooks/usePlayer.js";
import { Waveform } from "./Waveform.js";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getArtistNames(track: { artists: [number, { name: string }][] }): string {
  return track.artists.map(([, a]) => a.name).join(", ");
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function getLicenseUrl(track: Track): string {
  const artist = slugify(track.artists[0]?.[1]?.name ?? "unknown");
  const title = slugify(track.title);
  return `https://freetouse.com/music/${artist}/${title}/license`;
}

async function startDownload(track: Track) {
  const artists = getArtistNames(track);
  const filename = `${artists} - ${track.title} (freetouse.com).mp3`;
  try {
    chrome.downloads.setShelfEnabled(false);
    await chrome.downloads.download({
      url: track.files.mp3,
      filename,
      saveAs: false,
    });
  } catch {
    window.open(track.files.mp3, "_blank");
  }
}

interface PlayerProps {
  onDownload?: (track: Track) => void;
}

export function Player({ onDownload }: PlayerProps) {
  const { track, isPlaying, currentTime, duration, pause, resume, seek } = usePlayer();

  const handleSeek = useCallback(
    (fraction: number) => {
      if (duration > 0) {
        seek(fraction * duration);
        if (!isPlaying) resume();
      }
    },
    [duration, seek, isPlaying, resume],
  );

  if (!track) return null;

  const progress = duration > 0 ? currentTime / duration : 0;
  const artists = getArtistNames(track);

  return (
    <div className="app-player">
      <div className="player-bar">
        <img className="player-bar-cover" src={track.thumbnails.sm} alt="" />
        <div className="player-bar-info">
          <div className="player-bar-title">{track.title}</div>
          <div className="player-bar-artist">{artists}</div>
        </div>
        <span className="player-bar-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <button
          className={`player-bar-btn ${isPlaying ? "playing" : ""}`}
          onClick={() => (isPlaying ? pause() : resume())}
        >
          {isPlaying ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          className="player-bar-btn"
          title="Download"
          onClick={async () => {
            await startDownload(track);
            onDownload?.(track);
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
        </button>
        <button
          className="player-bar-btn"
          title="Purchase License"
          onClick={() => window.open(getLicenseUrl(track), "_blank")}
        >
          <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" style={{ marginBottom: "2px" }}>
            <path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1m3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4z" />
          </svg>
        </button>
      </div>
      <Waveform data={track.waveform} progress={progress} onSeek={handleSeek} />
      <div className="player-license">
        <strong>{track.title}</strong> <strong>by</strong> <strong>{artists}</strong> is licensed under the{" "}
        <a href="https://freetouse.com/license" target="_blank" rel="noreferrer" className="player-license-link">
          <strong>Free To Use License</strong>
        </a>
      </div>
    </div>
  );
}
