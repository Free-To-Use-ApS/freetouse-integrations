import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Track } from "@freetouse/api";
import type { Message, PlayerState } from "../../shared/messages.js";
import { INITIAL_STATE } from "../../shared/messages.js";

export interface PlayerContextValue extends PlayerState {
  play: (track: Track, queue?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
}

export const PlayerContext = createContext<PlayerContextValue>({
  ...INITIAL_STATE,
  play: () => {},
  pause: () => {},
  resume: () => {},
  seek: () => {},
});

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(INITIAL_STATE);
  const queueRef = useRef<Track[]>([]);

  // On mount, request current state from background
  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "GET_STATE" } satisfies Message,
      (response: Message | undefined) => {
        if (response?.type === "STATE_UPDATE") {
          setState(response.state);
        }
      },
    );
  }, []);

  // Listen for state updates from background
  useEffect(() => {
    function onMessage(msg: Message) {
      if (msg.type === "STATE_UPDATE") {
        setState(msg.state);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // Auto-advance to next track when current one ends
  useEffect(() => {
    if (!state.ended || !state.track) return;
    const queue = queueRef.current;
    if (queue.length === 0) return;
    const currentIndex = queue.findIndex((t) => t.id === state.track!.id);
    const nextTrack = queue[(currentIndex + 1) % queue.length];
    chrome.runtime.sendMessage({ type: "PLAY", track: nextTrack } satisfies Message);
  }, [state.ended, state.track]);

  const play = useCallback((track: Track, queue?: Track[]) => {
    if (queue) queueRef.current = queue;
    chrome.runtime.sendMessage({ type: "PLAY", track } satisfies Message);
  }, []);

  const pause = useCallback(() => {
    chrome.runtime.sendMessage({ type: "PAUSE" } satisfies Message);
  }, []);

  const resume = useCallback(() => {
    chrome.runtime.sendMessage({ type: "RESUME" } satisfies Message);
  }, []);

  const seek = useCallback((time: number) => {
    chrome.runtime.sendMessage({ type: "SEEK", time } satisfies Message);
  }, []);

  return (
    <PlayerContext.Provider value={{ ...state, play, pause, resume, seek }}>
      {children}
    </PlayerContext.Provider>
  );
}
