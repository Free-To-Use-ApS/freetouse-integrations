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
 * Each AudioCard owns its own HTMLAudioElement and the Kit's
 * AudioContextProvider guarantees only one plays at a time. This hook layers
 * on top of that: progress for the bottom bar, autoplay-next, and Media
 * Session (media keys). AudioCardRef has no seek API, so the bottom waveform
 * is a progress display (not click-to-seek).
 *
 * IMPORTANT performance design (avoids recreating AudioCards' audio elements):
 * the per-tick `currentTime` lives in `NowPlayingStateContext`, consumed ONLY
 * by the bottom Player. Track rows consume the STABLE controls context plus a
 * low-frequency active-track-id context, so they don't re-render on every
 * timeupdate and the Kit AudioCard effect (which depends on `onEnded`) never
 * re-runs — every handler passed to AudioCard is stable.
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
  onCardPlay: (track: Track, timestamp: number) => void;
  onCardPause: (track: Track, timestamp: number) => void;
  onCardTimeUpdate: (track: Track, timestamp: number) => void;
  onCardEnded: (track: Track) => void;
  toggleCurrent: () => void;
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
const ActiveTrackIdContext = createContext<string | null>(null);
// Split low-frequency (track / play state) from high-frequency (progress)
// state so the Player shell — and its buttons — only re-render when the track
// or play/pause state changes, not on every timeupdate tick (which would make
// the Kit Buttons drop clicks mid-press).
const TrackContext = createContext<NowPlayingTrackState | null>(null);
const ProgressContext = createContext<NowPlayingProgressState | null>(null);

const INITIAL: NowPlayingState = {
  track: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
};

export function NowPlayingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NowPlayingState>(INITIAL);

  // Mirror state into a ref so stable callbacks can read the latest values
  // without being re-created (which would churn AudioCard effects).
  const stateRef = useRef(state);
  stateRef.current = state;

  const cardRefs = useRef<Map<string, AudioCardRef>>(new Map());
  const queueRef = useRef<Track[]>([]);
  const lastTimeRef = useRef<Map<string, number>>(new Map()); // per-track time
  const playingIdRef = useRef<string | null>(null);
  const pendingAdvanceRef = useRef<number | null>(null);

  const cancelPendingAdvance = () => {
    if (pendingAdvanceRef.current !== null) {
      cancelAnimationFrame(pendingAdvanceRef.current);
      pendingAdvanceRef.current = null;
    }
  };

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

  const onCardPlay = useCallback((track: Track, timestamp: number) => {
    // A new track started — cancel any autoplay-advance scheduled by the
    // previous (near-end) track so it can't override the user's choice.
    cancelPendingAdvance();
    playingIdRef.current = track.id;
    lastTimeRef.current.set(track.id, timestamp);
    setState((s) => ({
      track,
      currentTime: timestamp,
      duration:
        s.track?.id === track.id && s.duration ? s.duration : track.duration,
      isPlaying: true,
    }));
  }, []);

  const onCardPause = useCallback((track: Track, timestamp: number) => {
    lastTimeRef.current.set(track.id, timestamp);
    setState((s) =>
      s.track?.id === track.id
        ? { ...s, currentTime: timestamp, isPlaying: false }
        : s,
    );
  }, []);

  const onCardTimeUpdate = useCallback((track: Track, timestamp: number) => {
    lastTimeRef.current.set(track.id, timestamp);
    setState((s) =>
      s.track?.id === track.id ? { ...s, currentTime: timestamp } : s,
    );
  }, []);

  const onCardEnded = useCallback((track: Track) => {
    // The Kit AudioContextProvider fires the PREVIOUS element's `ended` when a
    // new track starts, so only advance if this is still the active track AND
    // playback actually reached (near) the end of THIS track.
    if (playingIdRef.current !== track.id) return;
    const last = lastTimeRef.current.get(track.id) ?? 0;
    const reachedEnd = last >= (track.duration || 0) - 1.5;

    setState((s) => (s.track?.id === track.id ? { ...s, isPlaying: false } : s));
    if (!reachedEnd) return;

    // Clear so a re-fired `ended` for the same track is ignored.
    playingIdRef.current = null;
    const queue = queueRef.current;
    if (queue.length === 0) return;
    const idx = queue.findIndex((t) => t.id === track.id);
    const next = idx === -1 ? queue[0] : queue[(idx + 1) % queue.length];
    cancelPendingAdvance();
    pendingAdvanceRef.current = requestAnimationFrame(() => {
      pendingAdvanceRef.current = null;
      // If the user started another track in the meantime, playingIdRef will
      // no longer be null — don't override their choice.
      if (playingIdRef.current !== null) return;
      cardRefs.current.get(next.id)?.play();
    });
  }, []);

  const toggleCurrent = useCallback(() => {
    const id = stateRef.current.track?.id;
    if (!id) return;
    const ref = cardRefs.current.get(id);
    if (!ref) return;
    // Use the AudioCard ref's own state (the Kit's source of truth):
    //   isPaused()  -> active element but paused -> resume via play()
    //   isPlaying() -> active element and playing -> pause()
    //   neither     -> not the active element -> play()
    if (ref.isPaused()) ref.play();
    else if (ref.isPlaying()) ref.pause();
    else ref.play();
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

  // Register media-key handlers once; they read the latest refs.
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
    const step = (dir: 1 | -1) => {
      const id = stateRef.current.track?.id;
      const queue = queueRef.current;
      if (!id || queue.length === 0) return;
      const idx = queue.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const nextIdx = (idx + dir + queue.length) % queue.length;
      cardRefs.current.get(queue[nextIdx].id)?.play();
    };
    safe("play", () => {
      const id = stateRef.current.track?.id;
      if (id) cardRefs.current.get(id)?.play();
    });
    safe("pause", () => {
      const id = stateRef.current.track?.id;
      if (id) cardRefs.current.get(id)?.pause();
    });
    safe("nexttrack", () => step(1));
    safe("previoustrack", () => step(-1));
    return () => {
      safe("play", null);
      safe("pause", null);
      safe("nexttrack", null);
      safe("previoustrack", null);
    };
  }, []);

  // Stable controls — value never changes, so consumers (rows) don't re-render.
  const controls = useMemo<NowPlayingControls>(
    () => ({
      registerCard,
      setQueue,
      onCardPlay,
      onCardPause,
      onCardTimeUpdate,
      onCardEnded,
      toggleCurrent,
    }),
    [
      registerCard,
      setQueue,
      onCardPlay,
      onCardPause,
      onCardTimeUpdate,
      onCardEnded,
      toggleCurrent,
    ],
  );

  const activeTrackId = state.track?.id ?? null;

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
      <ActiveTrackIdContext.Provider value={activeTrackId}>
        <TrackContext.Provider value={trackValue}>
          <ProgressContext.Provider value={progressValue}>
            {children}
          </ProgressContext.Provider>
        </TrackContext.Provider>
      </ActiveTrackIdContext.Provider>
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

/** Low-frequency: the currently active track id (changes only on track switch). */
export function useActiveTrackId(): string | null {
  return useContext(ActiveTrackIdContext);
}

/** Low-frequency: the playing track + play/pause state (changes only on
 * track switch or play/pause). Safe for the Player shell + its buttons. */
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
