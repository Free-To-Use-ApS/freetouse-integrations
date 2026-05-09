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
