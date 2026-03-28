import type { Track } from "@freetouse/api";

export function getArtistNames(track: Track): string {
  return track.artists.map(([, a]) => a.name).join(", ");
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function getLicenseUrl(track: Track): string {
  const artist = slugify(track.artists[0]?.[1]?.name ?? "unknown");
  const title = slugify(track.title);
  return `https://freetouse.com/music/${artist}/${title}/license`;
}
