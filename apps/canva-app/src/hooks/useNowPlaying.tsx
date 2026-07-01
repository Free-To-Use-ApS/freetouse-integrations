import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AudioCardRef } from "@canva/app-ui-kit";
import type { Track } from "@freetouse/api";

/**
 * Coordinates playback across the Kit `AudioCard` rows and the bottom
 * "Now Playing" waveform bar.
 *
 * WHY WE OWN THE AUDIO ELEMENT
 * ----------------------------
 * The Kit `AudioCard` creates its `<audio>` with `new Audio()` in a private
 * ref, exposes only play/pause/restart/isPlaying/isPaused via `AudioCardRef`
 * (no seek), and the context that holds the element (`AudioContext`) is not
 * part of the package's public `exports`. So there is no way to seek the
 * AudioCard's playback — which is what a scrubbable waveform needs.
 *
 * To bring back click/drag scrubbing (Canva review feedback), the bottom
 * Now Playing bar drives playback from OUR OWN `<audio>` element, which we can
 * seek freely. The AudioCards stay in the browse list as launchers: when a card
 * starts its (Kit-owned) audio, we silence that card via its ref and play the
 * same track through our element instead — so only one audio ever sounds.
 *
 * PERFORMANCE
 * -----------
 * Per-tick `currentTime` lives in `ProgressContext`, consumed only by the
 * bottom Player's time/waveform. Track rows consume the STABLE controls context
 * plus a low-frequency active-track-id context, so they don't re-render every
 * timeupdate and the AudioCard effect never re-runs (all handlers are stable).
 */

interface NowPlayingState {
  track: Track | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

interface NowPlayingControls {
  registerCard: (trackId: string, ref: AudioCardRef | null) => void;
  setQueue: (tracks: Track[]) => void;
  /** Play a track (or toggle it if it's already the active track). Called from
   * the AudioCard's play button and card body. */
  playTrack: (track: Track) => void;
  /** Pause/resume the active track (bottom bar transport). */
  toggleCurrent: () => void;
  /** Seek the active track to a fraction (0–1) of its duration. */
  seek: (fraction: number) => void;
}

interface NowPlayingTrackState {
  track: Track | null;
  isPlaying: boolean;
}

interface NowPlayingProgressState {
  currentTime: number;
  duration: number;
}

const ControlsContext = createContext<NowPlayingControls | null>(null);
// Split low-frequency (track / play state) from high-frequency (progress)
// state so consumers (track rows, the Player shell + its buttons) only
// re-render when the track or play/pause state changes, not on every timeupdate
// tick (which would make the Kit Buttons drop clicks mid-press).
const TrackContext = createContext<NowPlayingTrackState | null>(null);
const ProgressContext = createContext<NowPlayingProgressState | null>(null);

const INITIAL: NowPlayingState = {
  track: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
};

/** Play, swallowing the AbortError that fires when a rapid src change / pause
 * interrupts a pending play() promise (expected, not an error). */
function safePlay(audio: HTMLAudioElement) {
  const p = audio.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

export function NowPlayingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NowPlayingState>(INITIAL);

  // Stable callbacks read the live track/audio via refs (not state) so their
  // identity never changes — the AudioCard effect that depends on them never
  // re-runs and never recreates its <audio> element.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRefs = useRef<Map<string, AudioCardRef>>(new Map());
  const queueRef = useRef<Track[]>([]);
  const currentTrackRef = useRef<Track | null>(null);
  // Holds the latest autoplay-advance fn so the (once-created) audio element's
  // `ended` handler always calls the current logic.
  const onEndedRef = useRef<() => void>(() => {});

  // Lazily create our own audio element (the real, seekable player) and wire
  // its events to state. Created once, on the first play.
  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = "metadata";
    audio.ontimeupdate = () => {
      const a = audioRef.current;
      if (a) setState((s) => (s.track ? { ...s, currentTime: a.currentTime } : s));
    };
    audio.onloadedmetadata = () => {
      const a = audioRef.current;
      if (a && Number.isFinite(a.duration) && a.duration > 0) {
        setState((s) => (s.track ? { ...s, duration: a.duration } : s));
      }
    };
    audio.onplay = () =>
      setState((s) => (s.track ? { ...s, isPlaying: true } : s));
    audio.onpause = () =>
      setState((s) => (s.track ? { ...s, isPlaying: false } : s));
    audio.onended = () => onEndedRef.current();
    // A failed load (404 / CDN error / CORS) never fires play or ended, which
    // would otherwise leave the transport stuck showing "playing" with no
    // sound. Reset the state so the UI is truthful and the user can recover.
    // (We don't auto-advance on error — a full outage would spin the queue.)
    audio.onerror = () =>
      setState((s) => (s.track ? { ...s, isPlaying: false } : s));
    audioRef.current = audio;
    return audio;
  }, []);

  // Load a track fresh and play it from the start.
  const loadAndPlay = useCallback(
    (track: Track) => {
      const audio = ensureAudio();
      currentTrackRef.current = track;
      audio.src = track.files.mp3;
      audio.currentTime = 0;
      setState({
        track,
        currentTime: 0,
        duration: track.duration,
        isPlaying: true,
      });
      safePlay(audio);
    },
    [ensureAudio],
  );

  const registerCard = useCallback(
    (trackId: string, ref: AudioCardRef | null) => {
      if (ref) cardRefs.current.set(trackId, ref);
      else cardRefs.current.delete(trackId);
    },
    [],
  );

  const setQueue = useCallback((tracks: Track[]) => {
    queueRef.current = tracks;
  }, []);

  const toggleCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackRef.current) return;
    if (audio.paused) safePlay(audio);
    else audio.pause();
  }, []);

  // Called from an AudioCard's play button (its Kit-owned audio has just
  // started) and from the card body. We silence the card's audio and drive
  // playback from our own element. If it's already the active track, toggle it.
  const playTrack = useCallback(
    (track: Track) => {
      cardRefs.current.get(track.id)?.pause(); // silence the Kit card's audio
      const audio = audioRef.current;
      if (audio && currentTrackRef.current?.id === track.id) {
        if (audio.paused) safePlay(audio);
        else audio.pause();
        return;
      }
      loadAndPlay(track);
    },
    [loadAndPlay],
  );

  const seek = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : currentTrackRef.current?.duration ?? 0;
    if (dur <= 0) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    // Never land exactly on the duration: seeking a playing element to its end
    // fires `ended` in Chromium, which would auto-advance to the next track
    // (so "seek to the end" would skip). Stay a hair short.
    audio.currentTime = Math.min(clamped * dur, Math.max(0, dur - 0.25));
    // Scrubbing the waveform resumes playback if it was paused (product pref).
    if (audio.paused) safePlay(audio);
    setState((s) => (s.track ? { ...s, currentTime: audio.currentTime } : s));
  }, []);

  // Move by an offset within the queue (media keys, autoplay-next).
  const stepBy = useCallback(
    (dir: 1 | -1) => {
      const cur = currentTrackRef.current;
      const queue = queueRef.current;
      if (!cur || queue.length === 0) return;
      const idx = queue.findIndex((t) => t.id === cur.id);
      if (idx === -1) return;
      loadAndPlay(queue[(idx + dir + queue.length) % queue.length]);
    },
    [loadAndPlay],
  );

  // Autoplay the next track when the current one ends naturally.
  const advance = useCallback(() => {
    const cur = currentTrackRef.current;
    const queue = queueRef.current;
    if (!cur || queue.length === 0) {
      setState((s) => ({ ...s, isPlaying: false }));
      return;
    }
    const idx = queue.findIndex((t) => t.id === cur.id);
    const next = idx === -1 ? queue[0] : queue[(idx + 1) % queue.length];
    loadAndPlay(next);
  }, [loadAndPlay]);
  onEndedRef.current = advance;

  // Pause our audio when the provider unmounts (panel close).
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // --- Media Session: surface the playing track to the OS / browser --------
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    if (!state.track) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }
    const track = state.track;
    const artist = track.artists.map(([, a]) => a.name).join(", ");
    const artwork: MediaImage[] = [];
    if (track.thumbnails?.sm)
      artwork.push({ src: track.thumbnails.sm, sizes: "100x100", type: "image/jpeg" });
    if (track.thumbnails?.md)
      artwork.push({ src: track.thumbnails.md, sizes: "200x200", type: "image/jpeg" });
    if (track.thumbnails?.lg)
      artwork.push({ src: track.thumbnails.lg, sizes: "400x400", type: "image/jpeg" });
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist,
      artwork,
    });
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  }, [state.track, state.isPlaying]);

  // Register media-key handlers once; they act on our own audio element.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    const safe = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* unsupported action — ignore */
      }
    };
    safe("play", () => {
      const audio = audioRef.current;
      if (audio && currentTrackRef.current) safePlay(audio);
    });
    safe("pause", () => {
      audioRef.current?.pause();
    });
    safe("nexttrack", () => stepBy(1));
    safe("previoustrack", () => stepBy(-1));
    return () => {
      safe("play", null);
      safe("pause", null);
      safe("nexttrack", null);
      safe("previoustrack", null);
    };
  }, [stepBy]);

  // Stable controls — value never changes, so consumers (rows) don't re-render.
  const controls = useMemo<NowPlayingControls>(
    () => ({
      registerCard,
      setQueue,
      playTrack,
      toggleCurrent,
      seek,
    }),
    [registerCard, setQueue, playTrack, toggleCurrent, seek],
  );

  // Low-frequency: changes only when the track or play/pause state changes.
  const trackValue = useMemo<NowPlayingTrackState>(
    () => ({ track: state.track, isPlaying: state.isPlaying }),
    [state.track, state.isPlaying],
  );
  // High-frequency: changes on every timeupdate tick.
  const progressValue = useMemo<NowPlayingProgressState>(
    () => ({ currentTime: state.currentTime, duration: state.duration }),
    [state.currentTime, state.duration],
  );

  return (
    <ControlsContext.Provider value={controls}>
      <TrackContext.Provider value={trackValue}>
        <ProgressContext.Provider value={progressValue}>
          {children}
        </ProgressContext.Provider>
      </TrackContext.Provider>
    </ControlsContext.Provider>
  );
}

/** Stable playback controls — safe for track rows (never causes re-renders). */
export function useNowPlayingControls(): NowPlayingControls {
  const ctx = useContext(ControlsContext);
  if (!ctx) {
    throw new Error("useNowPlayingControls must be used inside NowPlayingProvider");
  }
  return ctx;
}

/** Low-frequency: the playing track + play/pause state (changes only on
 * track switch or play/pause). Safe for track rows + the Player shell. */
export function useNowPlayingTrack(): NowPlayingTrackState {
  const ctx = useContext(TrackContext);
  if (!ctx) {
    throw new Error("useNowPlayingTrack must be used inside NowPlayingProvider");
  }
  return ctx;
}

/** High-frequency live progress — only the time readout + waveform should
 * consume this, so the rest of the Player doesn't re-render every tick. */
export function useNowPlayingProgress(): NowPlayingProgressState {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error(
      "useNowPlayingProgress must be used inside NowPlayingProvider",
    );
  }
  return ctx;
}
