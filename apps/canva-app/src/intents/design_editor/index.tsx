import "@canva/app-ui-kit/styles.css";
import type { DesignEditorIntent } from "@canva/intents/design";
import { createRoot } from "react-dom/client";
import { AppUiProvider, AudioContextProvider } from "@canva/app-ui-kit";
import { App } from "./app";

const render = async () => {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <AppUiProvider>
      <AudioContextProvider>
        <App />
      </AudioContextProvider>
    </AppUiProvider>
  );
};

export const designEditor: DesignEditorIntent = {
  render,
};

if ((module as any).hot) {
  (module as any).hot.accept("./app", () => {
    // HMR: re-render on app changes
  });
}
