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
import type { Track } from "@freetouse/api";

interface AudioPlayerState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  /** Set to true the moment a track finishes naturally — used by the
   * autoplay effect to advance to the next queued track. */
  ended: boolean;
}

interface AudioPlayerContextValue extends AudioPlayerState {
  play: (track: Track, queue?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  toggle: (track: Track, queue?: Track[]) => void;
  seek: (seconds: number) => void;
  isCurrent: (trackId: string) => boolean;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

/**
 * Provides a single shared HTMLAudioElement so only one track plays at a time.
 * Mount once at the root of the app.
 *
 * Autoplay: when a track finishes, automatically advances to the next track
 * in the queue (the visible track list at the time playback started). Wraps
 * back to the first track when the end of the queue is reached.
 */
export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null) {
    const el = new Audio();
    el.preload = "metadata";
    audioRef.current = el;
  }

  const queueRef = useRef<Track[]>([]);

  const [state, setState] = useState<AudioPlayerState>({
    track: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    ended: false,
  });

  // Wire up audio element events
  useEffect(() => {
    const audio = audioRef.current!;

    const onTimeUpdate = () =>
      setState((s) => ({ ...s, currentTime: audio.currentTime }));
    const onLoadedMetadata = () =>
      setState((s) => ({ ...s, duration: audio.duration || 0 }));
    const onPlay = () =>
      setState((s) => ({ ...s, isPlaying: true, ended: false }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));
    const onEnded = () =>
      setState((s) => ({
        ...s,
        isPlaying: false,
        currentTime: 0,
        ended: true,
      }));

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, []);

  const play = useCallback((track: Track, queue?: Track[]) => {
    if (queue) queueRef.current = queue;
    const audio = audioRef.current!;
    if (audio.src !== track.files.mp3) {
      audio.src = track.files.mp3;
      audio.currentTime = 0;
      setState({
        track,
        isPlaying: false,
        currentTime: 0,
        duration: track.duration,
        ended: false,
      });
    } else {
      setState((s) => ({ ...s, track, ended: false }));
    }
    audio.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const toggle = useCallback(
    (track: Track, queue?: Track[]) => {
      const audio = audioRef.current!;
      const isCurrent = state.track?.id === track.id;
      if (isCurrent && state.isPlaying) {
        audio.pause();
      } else if (isCurrent) {
        audio.play().catch(() => {});
        // Refresh queue even when resuming the current track so the next
        // autoplay step uses the freshest visible list.
        if (queue) queueRef.current = queue;
      } else {
        play(track, queue);
      }
    },
    [state.track, state.isPlaying, play],
  );

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current!;
    if (Number.isFinite(seconds)) {
      audio.currentTime = Math.max(0, Math.min(audio.duration || 0, seconds));
    }
  }, []);

  const isCurrent = useCallback(
    (trackId: string) => state.track?.id === trackId,
    [state.track],
  );

  // Autoplay: when a track ends naturally, advance to the next track in the
  // queue. Wraps back to the first track when reaching the end of the list.
  useEffect(() => {
    if (!state.ended || !state.track) return;
    const queue = queueRef.current;
    if (queue.length === 0) return;
    const idx = queue.findIndex((t) => t.id === state.track!.id);
    // If the just-played track is no longer in the queue (e.g. user
    // navigated to a different category), restart from the top of the new
    // queue instead.
    const nextIdx = idx === -1 ? 0 : (idx + 1) % queue.length;
    play(queue[nextIdx]);
  }, [state.ended, state.track, play]);

  // Latest-state ref so the media-session action handlers (registered once)
  // can always read the freshest track / queue without re-binding.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Sync MediaMetadata + playbackState with the currently playing track so
  // the OS / browser knows what's playing. This drives:
  //   - macOS Now Playing widget + Touch Bar controls
  //   - Keyboard media keys (play/pause/next/prev)
  //   - Bluetooth headset / car stereo controls
  //   - Browser-level media controls
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
    if (track.thumbnails?.xl)
      artwork.push({ src: track.thumbnails.xl, sizes: "800x800", type: "image/jpeg" });

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist,
      artwork,
    });
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  }, [state.track, state.isPlaying]);

  // Register media session action handlers once. They reach for the latest
  // state via stateRef / queueRef so they don't need to be re-registered on
  // every track change.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const audio = audioRef.current!;
    const ms = navigator.mediaSession;

    const safeSet = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Not all actions are supported in every browser — silently skip.
      }
    };

    safeSet("play", () => {
      audio.play().catch(() => {});
    });
    safeSet("pause", () => {
      audio.pause();
    });
    safeSet("previoustrack", () => {
      const t = stateRef.current.track;
      const queue = queueRef.current;
      if (!t || queue.length === 0) return;
      const idx = queue.findIndex((x) => x.id === t.id);
      const prevIdx =
        idx === -1 || idx === 0 ? queue.length - 1 : idx - 1;
      play(queue[prevIdx]);
    });
    safeSet("nexttrack", () => {
      const t = stateRef.current.track;
      const queue = queueRef.current;
      if (!t || queue.length === 0) return;
      const idx = queue.findIndex((x) => x.id === t.id);
      const nextIdx = idx === -1 ? 0 : (idx + 1) % queue.length;
      play(queue[nextIdx]);
    });
    safeSet("seekto", (details) => {
      if (details.seekTime != null && Number.isFinite(details.seekTime)) {
        audio.currentTime = details.seekTime;
      }
    });
    safeSet("seekbackward", (details) => {
      const step = details.seekOffset ?? 10;
      audio.currentTime = Math.max(0, audio.currentTime - step);
    });
    safeSet("seekforward", (details) => {
      const step = details.seekOffset ?? 10;
      audio.currentTime = Math.min(
        audio.duration || 0,
        audio.currentTime + step,
      );
    });
    safeSet("stop", () => {
      audio.pause();
      audio.currentTime = 0;
    });

    return () => {
      safeSet("play", null);
      safeSet("pause", null);
      safeSet("previoustrack", null);
      safeSet("nexttrack", null);
      safeSet("seekto", null);
      safeSet("seekbackward", null);
      safeSet("seekforward", null);
      safeSet("stop", null);
    };
  }, [play]);

  // Keep the OS-level position state in sync so scrubbing on the Now Playing
  // widget reflects actual progress (otherwise the slider stays at 0).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    if (!state.track || !state.duration) return;
    if (typeof ms.setPositionState !== "function") return;
    try {
      ms.setPositionState({
        duration: state.duration,
        playbackRate: 1,
        position: Math.min(state.currentTime, state.duration),
      });
    } catch {
      // Ignore — some browsers throw on rapid updates.
    }
  }, [state.track, state.duration, state.currentTime]);

  const value = useMemo<AudioPlayerContextValue>(
    () => ({ ...state, play, pause, resume, toggle, seek, isCurrent }),
    [state, play, pause, resume, toggle, seek, isCurrent],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) {
    throw new Error("useAudioPlayer must be used inside AudioPlayerProvider");
  }
  return ctx;
}
