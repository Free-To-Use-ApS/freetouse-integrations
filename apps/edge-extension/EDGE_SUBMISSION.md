# Publishing to the Microsoft Edge Add-ons store

This folder is the Edge build of the Free To Use music extension. It is a copy
of `apps/chrome-extension` with the obsolete download-shelf code removed
(`downloads.shelf` permission + `chrome.downloads.setShelfEnabled` calls), since
Chromium 117+ and Edge no longer have a download shelf. The code is otherwise
identical — Edge runs the same Manifest V3 package as Chrome.

The Edge Add-ons store is a **separate storefront** from the Chrome Web Store
(separate dashboard, review, and version uploads).

## Build the package

```bash
cd apps/edge-extension
npm run build      # builds popup + service worker into dist/
cd dist && zip -r ../free-to-use-edge-1.0.0.zip . && cd ..
```

The submittable artifact is the zip (manifest.json at the zip root,
`service-worker.js`, `assets/`, `icons/`, `src/`).

## Test it on Edge before submitting

1. Open `edge://extensions` and turn on **Developer mode** (toggle, bottom-left).
2. Click **Load unpacked** and select `apps/edge-extension/dist`.
3. The Free To Use icon appears in the toolbar (pin it via the puzzle-piece
   menu if it's hidden). Click it to open the popup.
4. Smoke test:
   - Play / pause a track; scrub the waveform.
   - Let a track finish — the autoplay queue should advance to the next track.
   - Search for a track; switch categories.
   - Open the attribution modal ("how to credit") and the "find similar" flow.
   - **Download a track** — confirm it saves cleanly to your Downloads folder
     (this is the path we changed for Edge). It should *not* open the MP3 in a
     new tab.
5. To reload after a code change: rebuild (`npm run build`), then click the
   refresh icon on the extension's card in `edge://extensions`.

If something misbehaves, fix it here in `apps/edge-extension` and rebuild.

## One-time developer setup

1. Edge Add-ons developer dashboard:
   https://partner.microsoft.com/dashboard/microsoftedge
2. Sign in with a Microsoft account (use the company account if Free To Use has
   one). Complete the one-time developer registration — **free**, no fee.
3. Accept the developer agreement.

## Create the submission

1. **Extensions → Create new extension** → upload the zip.
2. **Listing details** (reuse the Chrome copy — it's already browser-neutral):
   - **Name:** Royalty Free Music for Creators | Free To Use
   - **Short description:** Royalty-free background music – completely free,
     sign-up not even required.
   - **Category:** Productivity (or Photos & Media)
   - **Long description:** describe the player, search, categories, attribution
     modal, one-click download. Do **not** mention Chrome or any other browser
     (Edge store policy forbids referencing competing browsers).
3. **Store assets:** the 128px icon (in the package) plus at least one 1280×800
   or 640×480 screenshot of the popup. Reuse the Chrome Web Store screenshots.
4. **Privacy:** privacy policy URL (same one used for the Chrome listing); the
   extension collects no user data — declare accordingly.
5. **Permissions justification** (prompted per permission):
   - `downloads` — save selected tracks to the user's machine.
   - `downloads.ui` — suppress the browser's download flyout so it doesn't
     cover the extension popup when a track is downloaded.
   - `storage` — remember UI state (scroll position, selected category).
   - `offscreen` — play audio in the background via an offscreen document.
   - `host_permissions: https://*.freetouse.com/*` — fetch tracks and metadata
     from the Free To Use API/CDN.
6. Submit for certification. Review is typically hours to a few days; a first
   submission can occasionally take up to ~7 days.

## After it's live

The Edge listing is independent from Chrome. Future updates require uploading a
new zip (with a bumped `version` in manifest.json) to the Edge dashboard, and
keeping `apps/edge-extension` in sync with any changes made to the Chrome build.
