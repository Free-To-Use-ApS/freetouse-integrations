import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "@freetouse/api";
import { AttributionModal } from "../components/AttributionModal";

interface AttributionModalContextValue {
  /** Open the attribution modal for the given track. */
  showAttribution: (track: Track) => void;
}

const AttributionModalContext =
  createContext<AttributionModalContextValue | null>(null);

/**
 * Provides a single, app-wide attribution modal that any component can
 * trigger via `useAttributionModal().showAttribution(track)`. Mount once at
 * the root of the app.
 */
export function AttributionModalProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<Track | null>(null);

  const showAttribution = useCallback((t: Track) => {
    setTrack(t);
  }, []);

  const close = useCallback(() => setTrack(null), []);

  return (
    <AttributionModalContext.Provider value={{ showAttribution }}>
      {children}
      {track && <AttributionModal track={track} onClose={close} />}
    </AttributionModalContext.Provider>
  );
}

export function useAttributionModal(): AttributionModalContextValue {
  const ctx = useContext(AttributionModalContext);
  if (!ctx) {
    throw new Error(
      "useAttributionModal must be used inside AttributionModalProvider",
    );
  }
  return ctx;
}
