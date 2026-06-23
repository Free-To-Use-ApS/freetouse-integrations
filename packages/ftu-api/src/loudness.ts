// Perceived-loudness normalization derived from a track's waveform.
//
// The Free To Use API exposes no true loudness value (no LUFS / RMS / peak
// field). The only loudness-shaped signal is `Track.waveform`: 300 integers
// (0–100), each track normalized to its OWN peak. Because of that per-track
// peak normalization, a loud / compressed track sits high across the whole
// envelope (high mean) while a dynamic / quiet track sits lower — so the MEAN
// of the envelope is a good proxy for how loud a track *feels*. We use it to
// gently turn the loud tracks down so the volume stays consistent while a user
// browses from track to track. This mirrors the normalization on freetouse.com.
//
// Defaults are derived from the real catalog (400-track sample): the mean of
// the non-silent waveform spans ~p10=49 to ~p90=82, median ~68. A reference of
// 55 leaves roughly the quietest fifth untouched (we never boost — that would
// clip) and progressively attenuates louder tracks, compressing the perceived
// loudness range from ~1.7x down to ~1.2x.

export interface WaveformGainOptions {
  /**
   * Proxy level (mean of the non-silent waveform, 0–100) that maps to unity
   * gain. Tracks louder than this are attenuated; quieter tracks are left at
   * 1.0. Raise it for a gentler effect, lower it for stronger leveling.
   * Default 55.
   */
  reference?: number;
  /**
   * Lowest multiplier we will ever apply, so a single very loud master can't be
   * crushed toward silence. Expected in `[0, 1]`; values > 1 are ignored (the
   * result is always clamped to <= 1). Default 0.6.
   */
  floor?: number;
  /**
   * 0..1 — how strongly to level. 1 pulls every loud track all the way down to
   * the reference; lower values keep some natural variation between tracks.
   * Default 0.85.
   */
  strength?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Compute an attenuate-only volume multiplier in `[floor, 1]` for a track from
 * its waveform envelope, so loud tracks play at roughly the same perceived
 * level as quiet ones. Never returns > 1 (boosting would clip). Returns 1 when
 * there is no usable waveform data, so callers can apply it unconditionally.
 *
 * The returned value is a linear amplitude multiplier — assign it directly to a
 * Web Audio `GainNode.gain` target or to an `HTMLAudioElement.volume`.
 */
export function waveformToGain(
  waveform: number[] | null | undefined,
  options: WaveformGainOptions = {},
): number {
  const reference = options.reference ?? 55;
  const floor = options.floor ?? 0.6;
  const strength = options.strength ?? 0.85;

  if (!waveform || waveform.length === 0) return 1;

  // Ignore the leading / trailing silence of fades (read as 0) so they don't
  // drag the average down and make a track look quieter than it sounds.
  let sum = 0;
  let count = 0;
  for (const v of waveform) {
    if (v > 0) {
      sum += v;
      count += 1;
    }
  }
  if (count === 0) return 1;

  const mean = sum / count;
  if (mean <= reference) return 1; // at or below the reference — leave it alone

  const proportional = reference / mean; // < 1 for louder-than-reference tracks
  const gain = 1 - strength * (1 - proportional);
  // `Math.min(floor, 1)` keeps the attenuate-only invariant even if a caller
  // passes a nonsensical floor > 1 — the result is never > 1 (which would clip).
  return clamp(gain, Math.min(floor, 1), 1);
}
