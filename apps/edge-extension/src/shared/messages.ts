import type { Track } from "@freetouse/api";

// -- Messages from popup/background → offscreen (audio commands) ----------

export interface PlayMessage {
  type: "PLAY";
  track: Track;
}

export interface PauseMessage {
  type: "PAUSE";
}

export interface ResumeMessage {
  type: "RESUME";
}

export interface SeekMessage {
  type: "SEEK";
  time: number;
}

export interface GetStateMessage {
  type: "GET_STATE";
}

// -- Messages from offscreen → background → popup (state updates) ---------

export interface StateUpdateMessage {
  type: "STATE_UPDATE";
  state: PlayerState;
}

// -- Player state ---------------------------------------------------------

export interface PlayerState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  ended: boolean;
}

export const INITIAL_STATE: PlayerState = {
  track: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  ended: false,
};

// -- Union type -----------------------------------------------------------

export type Message =
  | PlayMessage
  | PauseMessage
  | ResumeMessage
  | SeekMessage
  | GetStateMessage
  | StateUpdateMessage;
