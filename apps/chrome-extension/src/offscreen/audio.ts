import type { Message, PlayerState } from "../shared/messages.js";
import type { Track } from "@freetouse/api";

const audioCtx = new AudioContext();
const audio = new Audio();
const sourceNode = audioCtx.createMediaElementSource(audio);
const gainNode = audioCtx.createGain();
sourceNode.connect(gainNode).connect(audioCtx.destination);

let currentTrack: Track | null = null;

function updateMediaSession(track: Track) {
  const artists = track.artists.map(([, a]) => a.name).join(", ");
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: artists,
    album: "",
    artwork: [
      { src: track.thumbnails.sm, sizes: "96x96", type: "image/jpeg" },
      { src: track.thumbnails.md, sizes: "256x256", type: "image/jpeg" },
      { src: track.thumbnails.lg, sizes: "512x512", type: "image/jpeg" },
      { src: track.thumbnails.xl, sizes: "1024x1024", type: "image/jpeg" },
    ],
  });
}

/** Short fade-out to avoid audio pop when switching tracks */
function fadeOut(durationMs = 60): Promise<void> {
  if (audio.paused) return Promise.resolve();
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function fadeIn() {
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(1, now + 0.06);
}

/** Safely call audio.play() and swallow AbortError from interrupted playback */
function safePlay() {
  audio.play().catch((err) => {
    if (err.name !== "AbortError") throw err;
  });
}

function sendState(ended = false) {
  const state: PlayerState = {
    track: currentTrack,
    isPlaying: !audio.paused,
    currentTime: audio.currentTime,
    duration: audio.duration || 0,
    ended,
  };
  chrome.runtime.sendMessage({ type: "STATE_UPDATE", state } satisfies Message);
}

// Broadcast state on key audio events
audio.addEventListener("timeupdate", () => sendState());
audio.addEventListener("play", () => sendState());
audio.addEventListener("pause", () => sendState());
audio.addEventListener("ended", () => sendState(true));
audio.addEventListener("loadedmetadata", () => sendState());

// Listen for commands from the background service worker
chrome.runtime.onMessage.addListener((msg: Message) => {
  switch (msg.type) {
    case "PLAY":
      fadeOut().then(() => {
        audio.pause();
        currentTrack = msg.track;
        audio.src = msg.track.files.mp3;
        updateMediaSession(msg.track);
        fadeIn();
        safePlay();
      });
      break;
    case "PAUSE":
      fadeOut().then(() => audio.pause());
      break;
    case "RESUME":
      if (audioCtx.state === "suspended") audioCtx.resume();
      fadeIn();
      safePlay();
      break;
    case "SEEK":
      audio.currentTime = msg.time;
      break;
    case "GET_STATE":
      sendState();
      break;
  }
});
