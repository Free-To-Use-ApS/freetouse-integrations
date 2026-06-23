import { useContext } from "react";
import { PlayerContext } from "../context/PlayerContext.js";

export function usePlayer() {
  return useContext(PlayerContext);
}
