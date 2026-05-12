import "@canva/app-ui-kit/styles.css";
import type { DesignEditorIntent } from "@canva/intents/design";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { AppUiProvider } from "@canva/app-ui-kit";
import { AppI18nProvider } from "@canva/app-i18n-kit";
import { App } from "./app";
import { AudioPlayerProvider } from "../../hooks/useAudioPlayer";
import { AttributionModalProvider } from "../../hooks/useAttributionModal";

/**
 * Wraps the app in Canva's `AppI18nProvider` when the platform's i18n SDK
 * is available (production / Canva preview), and falls back to plain
 * `react-intl` `IntlProvider` otherwise (some dev environments where
 * `window.canva_sdk.platform.v2.i18n` hasn't been exposed). With no
 * translations loaded, `defaultMessage` is used directly — i.e. all UI
 * renders in English.
 */
function I18nRoot({ children }: { children: ReactNode }) {
  const canvaI18n =
    typeof window !== "undefined" &&
    (window as unknown as {
      canva_sdk?: {
        platform?: { v2?: { i18n?: { getLocalizedMessages?: unknown } } };
      };
    }).canva_sdk?.platform?.v2?.i18n;

  if (canvaI18n && typeof canvaI18n.getLocalizedMessages === "function") {
    return <AppI18nProvider>{children}</AppI18nProvider>;
  }
  return (
    <IntlProvider locale="en" defaultLocale="en">
      {children}
    </IntlProvider>
  );
}

const render = async () => {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <I18nRoot>
      <AppUiProvider>
        <AudioPlayerProvider>
          <AttributionModalProvider>
            <App />
          </AttributionModalProvider>
        </AudioPlayerProvider>
      </AppUiProvider>
    </I18nRoot>
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
