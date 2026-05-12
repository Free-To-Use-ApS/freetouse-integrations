import { useCallback, useRef } from "react";
import { useIntl } from "react-intl";

interface WaveformProps {
  /** ~300 integers (0–100) representing loudness over time */
  data: number[];
  /** 0–1 progress through the track */
  progress: number;
  /** Called with a 0–1 value when the user clicks/drags to seek */
  onSeek: (fraction: number) => void;
}

/** Number of bars to render — fits the bottom player nicely. */
const BAR_COUNT = 120;

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

export function Waveform({ data, progress, onSeek }: WaveformProps) {
  const intl = useIntl();
  const containerRef = useRef<HTMLDivElement>(null);
  const bars = downsample(data, BAR_COUNT);

  const seekFromX = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Subtract horizontal padding so the fraction is computed against the
      // actual bar area, not the full element width. Without this, clicks
      // near the right edge land "before" where the cursor is because the
      // right padding eats part of the divisor.
      const styles = getComputedStyle(el);
      const padLeft = parseFloat(styles.paddingLeft) || 0;
      const padRight = parseFloat(styles.paddingRight) || 0;
      const innerLeft = rect.left + padLeft;
      const innerWidth = rect.width - padLeft - padRight;
      if (innerWidth <= 0) return;
      const fraction = Math.max(
        0,
        Math.min(1, (clientX - innerLeft) / innerWidth),
      );
      onSeek(fraction);
    },
    [onSeek],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      seekFromX(e.clientX);

      const handleMove = (ev: PointerEvent) => {
        if (target.hasPointerCapture(ev.pointerId)) seekFromX(ev.clientX);
      };
      const handleUp = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleUp);
        target.removeEventListener("pointercancel", handleUp);
      };

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleUp);
      target.addEventListener("pointercancel", handleUp);
    },
    [seekFromX],
  );

  const playedIndex = Math.floor(progress * BAR_COUNT);

  return (
    <div
      ref={containerRef}
      className="ftu-wave"
      onPointerDown={handlePointerDown}
      role="slider"
      aria-label={intl.formatMessage({
        defaultMessage: "Track progress",
        description:
          "Accessible label for the waveform scrubber that shows / controls playback position.",
      })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
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
