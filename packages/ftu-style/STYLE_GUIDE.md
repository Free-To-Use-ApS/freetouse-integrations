# Free To Use – Style Guide

Design tokens and patterns extracted from freetouse.com. All apps and extensions in this monorepo should use these to maintain a consistent look.

## Usage

```css
/* Import in your app's CSS entry point */
@import "@freetouse/style/variables.css";
@import "@freetouse/style/base.css";

/* Optional component styles */
@import "@freetouse/style/components/player.css";
@import "@freetouse/style/components/waveform.css";
@import "@freetouse/style/components/pills.css";
```

All tokens are prefixed with `--ftu-` to avoid collisions.

---

## Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--ftu-primary` | `#7569de` | Brand purple. Buttons, links, active states |
| `--ftu-primary-hover` | `#635ecc` | Primary on hover/press |
| `--ftu-primary-light` | `#978ee6` | Lighter purple for focus rings, accents |
| `--ftu-secondary` | `#383838` | Body text, dark UI elements |
| `--ftu-grey` | `#969696` | Secondary text, icons, inactive controls |
| `--ftu-grey-hover` | `#7f7f7f` | Grey on hover |
| `--ftu-light-grey` | `#d1d1d1` | Borders, dividers, waveform base color |
| `--ftu-light` | `#f2f2f2` | Subtle backgrounds (header, cards) |
| `--ftu-lighter` | `#f7f7f7` | Lightest background (tags, loading states) |
| `--ftu-white` | `#ffffff` | Card backgrounds, primary bg |
| `--ftu-green` | `#79c67d` | Success states, download buttons |
| `--ftu-green-hover` | `#54af56` | Green on hover |

Every color also has an `-rgb` variant (e.g. `--ftu-primary-rgb: 117, 105, 222`) for use with `rgba()`.

## Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--ftu-font-family` | `'Nunito', 'Montserrat', system-ui, sans-serif` | All text |
| `--ftu-font-weight-lighter` | `300` | Subtitles, descriptions |
| `--ftu-font-weight-normal` | `400` | Body text |
| `--ftu-font-weight-medium` | `500` | Buttons, pill toggles |
| `--ftu-font-weight-bold` | `700` | Emphasis, submit buttons |
| `--ftu-font-weight-bolder` | `800` | Headings (h1–h4) |
| `--ftu-font-weight-title` | `750` | Track titles |

**Font sizes (contextual, not tokenized):**
- Track title: `115%`
- Artist names: `smaller`
- Tags: `65%`
- Duration badge: `60%`
- Blog paragraph: `125%`, line-height `1.75`

**Primary font: Nunito** — variable weight (200–1000), loaded from Google Fonts. Fallback to Montserrat, then system sans-serif.

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--ftu-radius-pill` | `5rem` | Buttons, inputs, selects, tags |
| `--ftu-radius-card` | `1rem` | Track player, cards, accordions |
| `--ftu-radius-modal` | `1.375rem` | Modals, cover images, blog cards |
| `--ftu-radius-sm` | `0.75rem` | Small rounded elements |

## Transitions

| Token | Value |
|-------|-------|
| `--ftu-transition-speed` | `250ms` |

Standard speed for all transitions (color, background, transform, opacity).

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--ftu-shadow-header` | `0 2px 5px 0 rgba(0,0,0,0.075)` | Header bar |
| `--ftu-shadow-notification` | `0 0 2rem rgba(0,0,0,0.15)` | Toasts, notifications |

## Hover Scale Effects

Used with `@media (pointer: fine)` to only apply on devices with a precise pointer (not touch).

| Context | Scale |
|---------|-------|
| Cards, featured items | `1.05` |
| Blog summaries, subtle cards | `1.025` |
| Track player rows | `1.0125` |

## Component Patterns

### Track Player (`.ftu-player`)
- White background, `1rem` border radius
- Fixed height: `4.5rem`
- Layout: cover image (square, left) → track info → waveform → play/duration/actions
- Cover has rounded left corners matching the card
- Vertical dividers between sections: 1px, `rgba(grey, 0.3)`
- Play button turns purple (`--ftu-primary`) when playing

### Waveform (`.ftu-wave`)
- 300 bars representing loudness (0–100 height)
- Base color: `--ftu-light-grey`
- Played color: `--ftu-primary`
- `1px` gap between bars
- Hover preview shows purple on pointer devices

### Pill Toggle (`.ftu-pill-toggle`)
- Container: `#e9ecef` background, fully rounded
- Buttons: transparent by default, white background when active
- Text: grey when inactive, dark when active

### Tags (`.ftu-tag`)
- Background: `--ftu-lighter`
- Text: `--ftu-grey`
- Fully rounded (pill shape)
- Small font (65%)
- Hover darkens background

### Buttons (`.ftu-btn`)
- Fully rounded (`5rem` radius)
- Primary: purple bg, white text
- Success: green bg, white text
- Lighter: `--ftu-lighter` bg, grey text

### Inputs (`.ftu-input`)
- Fully rounded, 1px light-grey border
- Focus: border turns `--ftu-primary-light`
- Placeholder: 50% opacity, lighter weight

### Loading States
- Brightness pulse animation (750ms, alternate, infinite)
- User interaction disabled during loading
- Skeleton: lighter background blocks in place of text
