import { useRef } from "react";
import { useIntl } from "react-intl";

interface WaveformProps {
  /** ~300 integers (0–100) representing loudness over time */
  data: number[];
  /** 0–1 progress through the track */
  progress: number;
  /** Called with a 0–1 fraction when the user clicks/drags/keys to seek. If
   * omitted, the waveform is display-only. */
  onSeek?: (fraction: number) => void;
}

/** Number of bars to render — fits the bottom player nicely. */
const BAR_COUNT = 120;

/** Keyboard seek step, as a fraction of the track. */
const KEY_STEP = 0.02;

function downsample(data: number[], bars: number): number[] {
  if (!data || data.length === 0) return new Array(bars).fill(0);
  const step = data.length / bars;
  const result: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j] ?? 0;
    result.push(sum / (end - start));
  }
  return result;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Waveform scrubber for the bottom Now Playing bar — the one custom component
 * Canva's review allows, styled with Kit color tokens (played bars in the brand
 * color, unplayed in a subtle content color).
 *
 * It is click/drag/keyboard seekable via `onSeek`: the fraction is computed from
 * the exact pointer x over the container (NOT the bar index), so a click lands
 * precisely where the pointer is — including right at the end of the track.
 * Playback is driven by our own audio element (the Kit AudioCard exposes no seek
 * API), which is why seeking is possible here at all.
 */
export function Waveform({ data, progress, onSeek }: WaveformProps) {
  const intl = useIntl();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const bars = downsample(data, BAR_COUNT);
  const playedIndex = Math.floor(clamp01(progress) * BAR_COUNT);

  const fractionFromClientX = (clientX: number): number => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    // Capture so a drag that leaves the element still tracks.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — clicks still work */
    }
    draggingRef.current = true;
    onSeek(fractionFromClientX(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek || !draggingRef.current) return;
    onSeek(fractionFromClientX(e.clientX));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* nothing to release */
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = progress - KEY_STEP;
    else if (e.key === "ArrowRight") next = progress + KEY_STEP;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;
    if (next !== null) {
      e.preventDefault();
      onSeek(clamp01(next));
    }
  };

  const seekable = Boolean(onSeek);

  return (
    <div
      ref={containerRef}
      className={`ftu-wave${seekable ? " ftu-wave-seekable" : ""}`}
      role={seekable ? "slider" : "progressbar"}
      tabIndex={seekable ? 0 : undefined}
      aria-label={intl.formatMessage({
        defaultMessage: "Seek",
        description:
          "Accessible label for the waveform that shows and controls the playing track's position.",
      })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp01(progress) * 100)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
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
