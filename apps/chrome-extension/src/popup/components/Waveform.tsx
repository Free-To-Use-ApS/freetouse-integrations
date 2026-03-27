import { useCallback, useRef } from "react";

interface WaveformProps {
  /** 300 integers (0-100) representing loudness over time */
  data: number[];
  /** 0-1 progress through the track */
  progress: number;
  /** Called with a 0-1 value when the user clicks to seek */
  onSeek: (fraction: number) => void;
}

/** Number of bars to render (fits nicely in the compact player width). */
const BAR_COUNT = 120;

/** Downsample the 300-point waveform to BAR_COUNT bars by averaging. */
function downsample(data: number[], bars: number): number[] {
  const step = data.length / bars;
  const result: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    result.push(sum / (end - start));
  }
  return result;
}

export function Waveform({ data, progress, onSeek }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bars = downsample(data, BAR_COUNT);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(fraction);
    },
    [onSeek],
  );

  // Index of the last "played" bar
  const playedIndex = Math.floor(progress * BAR_COUNT);

  return (
    <div
      ref={containerRef}
      className="ftu-wave player-waveform"
      onClick={handleClick}
    >
      {bars.map((value, i) => (
        <span
          key={i}
          className="ftu-wave-bar"
          data-played={i <= playedIndex ? "true" : undefined}
          style={{ height: `${Math.max(3, value)}%` }}
        />
      ))}
    </div>
  );
}
