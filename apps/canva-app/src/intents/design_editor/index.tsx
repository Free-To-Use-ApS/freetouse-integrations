import "@canva/app-ui-kit/styles.css";
import type { DesignEditorIntent } from "@canva/intents/design";
import { createRoot } from "react-dom/client";
import { AppUiProvider } from "@canva/app-ui-kit";
import { App } from "./app";
import { AudioPlayerProvider } from "../../hooks/useAudioPlayer";
import { AttributionModalProvider } from "../../hooks/useAttributionModal";

const render = async () => {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <AppUiProvider>
      <AudioPlayerProvider>
        <AttributionModalProvider>
          <App />
        </AttributionModalProvider>
      </AudioPlayerProvider>
    </AppUiProvider>
  );
};

const designEditor: DesignEditorIntent = {
  render,
};

export default designEditor;

if ((module as any).hot) {
  (module as any).hot.accept("./app", () => {
    // HMR: re-render on app changes
  });
}
