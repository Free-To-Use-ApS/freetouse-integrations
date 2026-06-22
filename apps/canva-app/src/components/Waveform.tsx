import { useIntl } from "react-intl";

interface WaveformProps {
  /** ~300 integers (0–100) representing loudness over time */
  data: number[];
  /** 0–1 progress through the track */
  progress: number;
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

/**
 * Display-only waveform progress visualization for the bottom Now Playing bar.
 *
 * This is the one custom component Canva's review allows (a waveform scrubber),
 * styled with Kit color tokens. It shows playback progress (played bars in the
 * brand color, unplayed in a subtle content color). It is not click-to-seek:
 * the Kit AudioCard owns playback and exposes no seek API.
 */
export function Waveform({ data, progress }: WaveformProps) {
  const intl = useIntl();
  const bars = downsample(data, BAR_COUNT);
  const playedIndex = Math.floor(progress * BAR_COUNT);

  return (
    <div
      className="ftu-wave"
      role="progressbar"
      aria-label={intl.formatMessage({
        defaultMessage: "Playback progress",
        description:
          "Accessible label for the waveform that shows the playing track's progress.",
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
