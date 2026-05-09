# @freetouse/music-app

Shared playbook and conventions for building Free To Use music apps (browser extensions, Canva apps, native plugins, etc.).

This package doesn't export code — it's a knowledge base. Before building a new app, **read `PLAYBOOK.md`**. It captures every pattern, bug fix, and gotcha learned from building the existing apps so you don't have to rediscover them.

## What's here

- **`PLAYBOOK.md`** — comprehensive guide for building a new music app
- **`CHEATSHEET.md`** — quick reference card of file structure, must-have features, and common pitfalls

## Reference apps

The two reference implementations live under `apps/`:

- `apps/chrome-extension/` — Browser popup with offscreen audio, downloads, attribution modal
- `apps/canva-app/` — Canva editor side panel with drag-to-design, click-to-add, attribution modal

Both apps share the same UX conventions (track list layout, player bar, waveform scrubber, autoplay, find-similar, state restoration). They differ only in platform integration (download vs add-to-design, browser vs Canva APIs).

## Building a new app

1. Read `PLAYBOOK.md` end-to-end (or skim the table of contents for the relevant sections).
2. Decide which reference app is closer to your platform and start by copying its `src/popup/` (Chrome) or `src/intents/design_editor/` (Canva) directory.
3. Replace platform-specific code (storage, navigation, "add to project" action) with your platform's equivalents.
4. Reuse `@freetouse/api` for data and `@freetouse/style` for design tokens.
5. Cross-reference `CHEATSHEET.md` to make sure you didn't skip any must-haves.
