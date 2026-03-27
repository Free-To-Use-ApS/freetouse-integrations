import type { Track, TrackCategory } from "@freetouse/api";
import { usePlayer } from "../hooks/usePlayer.js";

interface TrackItemProps {
  track: Track;
  queue: Track[];
  onFindSimilar: (trackId: string) => void;
}

function getArtistNames(track: Track): string {
  return track.artists.map(([, a]) => a.name).join(", ");
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function getTagLabels(track: Track): string[] {
  return track.tags_categories.slice(0, 2).map(([, item]) => {
    const name = typeof item === "string" ? item : (item as TrackCategory).name;
    return capitalize(name);
  });
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

export function TrackItem({ track, queue, onFindSimilar }: TrackItemProps) {
  const { track: currentTrack, isPlaying, play, pause, resume } = usePlayer();
  const isActive = currentTrack?.id === track.id;
  const tags = getTagLabels(track);

  function handleClick() {
    if (isActive && isPlaying) {
      pause();
    } else if (isActive) {
      resume();
    } else {
      play(track, queue);
    }
  }

  return (
    <div className={`track-item ${isActive ? "active" : ""}`} onClick={handleClick}>
      <img className="track-item-cover" src={track.thumbnails.sm} alt="" loading="lazy" />
      <div className="track-item-info">
        <div className="track-item-title">{track.title}</div>
        <div className="track-item-artist">{getArtistNames(track)}</div>
      </div>
      {tags.length > 0 && (
        <div className="track-item-tags">
          {tags.map((tag) => (
            <span key={tag} className="track-item-tag">{tag}</span>
          ))}
        </div>
      )}
      <div className="track-item-actions">
        <button
          className="track-action-btn track-action-btn--text"
          onClick={(e) => { e.stopPropagation(); onFindSimilar(track.id); }}
        >
          <span className="track-action-btn-content">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/>
            </svg>
            Find Similar
          </span>
        </button>
      </div>
    </div>
  );
}
