import type { Message, PlayerState } from "../shared/messages.js";
import { INITIAL_STATE } from "../shared/messages.js";

let cachedState: PlayerState = { ...INITIAL_STATE };

let offscreenReady: Promise<void> | null = null;

async function ensureOffscreen() {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async () => {
    try {
      const exists = await chrome.offscreen.hasDocument();
      if (!exists) {
        await chrome.offscreen.createDocument({
          url: "src/offscreen/index.html",
          reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
          justification: "Playing royalty-free music from Free To Use",
        });
      }
    } catch {
      // Document already exists – safe to ignore
      offscreenReady = null;
    }
  })();
  return offscreenReady;
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  // Cache state updates from the offscreen document
  if (msg.type === "STATE_UPDATE") {
    cachedState = msg.state;
    return;
  }

  // When popup asks for state, reply immediately with cached state
  if (msg.type === "GET_STATE") {
    sendResponse({ type: "STATE_UPDATE", state: cachedState } satisfies Message);
    return;
  }

  // Forward playback commands to the offscreen document
  ensureOffscreen().then(() => {
    chrome.runtime.sendMessage(msg);
  });
});
