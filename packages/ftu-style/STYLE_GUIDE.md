# Free To Use – Style Guide

Design tokens, patterns, and component styles for all Free To Use apps and extensions. Every project in this monorepo should use these to maintain a consistent look and feel.

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
| `--ftu-primary` | `#7569de` | Brand purple. Buttons, links, active states, playing indicators |
| `--ftu-primary-hover` | `#635ecc` | Primary on hover/press |
| `--ftu-primary-light` | `#978ee6` | Lighter purple for focus rings, input focus borders |
| `--ftu-secondary` | `#383838` | Body text, headings, dark UI elements |
| `--ftu-grey` | `#969696` | Secondary text, icons, inactive controls, duration labels |
| `--ftu-grey-hover` | `#7f7f7f` | Grey on hover, tag text |
| `--ftu-light-grey` | `#d1d1d1` | Borders, dividers, waveform base color, footer links |
| `--ftu-light` | `#f2f2f2` | Subtle backgrounds (header, active track items) |
| `--ftu-lighter` | `#f7f7f7` | Lightest background (tags, category pills, loading states, cover placeholders) |
| `--ftu-white` | `#ffffff` | Card backgrounds, primary bg, player bar bg |
| `--ftu-green` | `#79c67d` | Success states, copied confirmation |
| `--ftu-green-hover` | `#54af56` | Green on hover |

Every color also has an `-rgb` variant (e.g. `--ftu-primary-rgb: 117, 105, 222`) for use with `rgba()`.

### Derived colors (not tokenized)

| Value | Usage |
|-------|-------|
| `#5e656b` | Category pill text on hover (25% darker than `--ftu-grey`) |
| `rgba(var(--ftu-light-grey-rgb), 0.45)` | Category pill / load-more button hover background |
| `rgba(0, 0, 0, 0.45)` | Modal backdrop overlay |

## Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--ftu-font-family` | `'Nunito', 'Montserrat', system-ui, sans-serif` | All text |
| `--ftu-font-weight-lighter` | `300` | Placeholder text |
| `--ftu-font-weight-normal` | `400` | Body text |
| `--ftu-font-weight-medium` | `500` | Buttons, pills, tags, action links, footer links |
| `--ftu-font-weight-bold` | `700` | Emphasis, submit buttons |
| `--ftu-font-weight-bolder` | `800` | Headings, modal titles |
| `--ftu-font-weight-title` | `750` | Track titles |

**Primary font: Nunito** — variable weight (200–1000), loaded from Google Fonts. Fallback to Montserrat, then system sans-serif.

### Font sizes

| Context | Size |
|---------|------|
| Search input | `0.875rem` (14px) |
| Track title (list) | `0.8125rem` (13px) |
| Track artist (list) | `0.6875rem` (11px) |
| Category pill | `0.75rem` (12px) |
| Track tag | `0.5625rem` (9px) |
| Action link ("Find Similar") | `0.75rem` (12px) |
| Player bar title | `0.75rem` (12px) |
| Player bar artist | `0.625rem` (10px) |
| Player bar duration | `0.6875rem` (11px) |
| Footer link | `0.625rem` (10px) |
| License text | `0.5625rem` (9px) |
| Loading text | `0.8125rem` (13px) |
| Load more button | `0.75rem` (12px) |
| Modal title | `1.125rem` (18px) |
| Modal description | `0.8125rem` (13px) |
| Attribution text | `0.75rem` (12px) |
| Back button | `0.8125rem` (13px) |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--ftu-radius-pill` | `5rem` | Buttons, inputs, category pills, tags, load-more |
| `--ftu-radius-card` | `1rem` | Track items, cards |
| `--ftu-radius-modal` | `1.375rem` | Modals, cover images |
| `--ftu-radius-sm` | `0.75rem` | Cover artwork, action buttons, attribution boxes, skeleton placeholders |

## Transitions

| Token | Value |
|-------|-------|
| `--ftu-transition-speed` | `250ms` |

Standard speed for all transitions (color, background, transform, opacity). Exception: action link underline and content lift uses `150ms ease`.

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--ftu-shadow-header` | `0 2px 5px 0 rgba(0,0,0,0.075)` | Header bar |
| `--ftu-shadow-notification` | `0 0 2rem rgba(0,0,0,0.15)` | Modals, toasts, notifications |

---

## Component Patterns

### App Layout

Standard vertical flex layout for popup-style apps:

| Section | Behavior |
|---------|----------|
| `.app-header` | Fixed at top, light grey background (`--ftu-light`), holds search + categories |
| `.app-content` | Flex-grow, scrollable (`overflow-y: auto`), `0.5rem` padding |
| `.app-player` | Fixed at bottom, separated by `1px` top border |

### Search Input

- Full width, pill-shaped (`--ftu-radius-pill`)
- `0.5rem` vertical / `1rem` horizontal padding, extra right padding for icon (`2.25rem`)
- Border: `1px solid --ftu-light-grey`, turns `--ftu-primary-light` on focus
- Placeholder: 50% opacity, lighter weight
- Icon positioned absolute, right-aligned, grey, non-interactive
- Clear button replaces icon when input has value

### Category Pills

- Horizontal scrollable row, hidden scrollbar, `0.375rem` gap
- Each pill: `--ftu-lighter` background, `--ftu-grey` text, pill radius
- Padding: `0.25rem 0.75rem`
- Hover: slightly darker background (`rgba(light-grey, 0.45)`) + darker text (`#5e656b`)
- Active: `--ftu-primary` background, white text
- "All" pill always first; remaining categories shuffled randomly per browser session
- Category order persisted in session storage (re-shuffles on browser restart)

### Track List

- Vertical flex column, `0.375rem` gap
- Each track item: horizontal flex, `0.625rem` gap, `0.375rem` padding, `1rem` border radius
- Hover: `--ftu-lighter` background
- Active (playing): `--ftu-light` background

**Track item layout:**

| Element | Specs |
|---------|-------|
| Cover art | `2.75rem` square, `--ftu-radius-sm` rounded, `object-fit: cover`, `--ftu-lighter` placeholder bg |
| Info column | Flex-grow, min-width 0, title + artist stacked with `0.125rem` gap |
| Title | Weight `750`, `0.8125rem`, single line with ellipsis |
| Artist | `0.6875rem`, `--ftu-grey` color, single line with ellipsis |
| Tags | Right-aligned column, shown by default, hidden on hover |
| Actions | Hidden by default, shown on hover, `0.5rem` right margin |

**Tag styling:** `0.5625rem` font, `--ftu-grey-hover` text, `--ftu-lighter` background, pill-shaped, `0.1875rem 0.5rem` padding.

**Action link ("Find Similar"):** `--ftu-primary` color, `0.75rem` font, medium weight. On hover: darker purple, text lifts `2px`, underline fades in (`1.5px`, `currentColor`).

### Player Bar

- Horizontal flex, `0.5rem` gap, `0.5rem 0.75rem` padding
- White background, top border separator

| Element | Specs |
|---------|-------|
| Cover art | `2.5rem` square, `--ftu-radius-sm` rounded |
| Info column | Title (`0.75rem`, weight 750) + artist (`0.625rem`, grey) |
| Waveform | `1.75rem` height, `0 0.75rem` padding, clickable |
| Play button | Grey icon, turns `--ftu-primary` when playing, hover: `--ftu-primary-hover` |
| Duration | `0.6875rem`, grey |
| Action icons | Grey, hover turns `--ftu-primary-hover`. No background circles. |

### Back Button

- Horizontal flex, `0.375rem` gap, grey text, `0.8125rem` font, medium weight
- Hover: turns `--ftu-primary`
- Arrow icon: 17px, with slight upward offset (`margin-bottom: 2px`) for visual alignment

### Footer Links

- Centered row, `0.375rem` gap, `0.625rem` top/bottom margin
- Link text: `0.625rem`, medium weight, `--ftu-light-grey` color
- Hover: `--ftu-grey` color, underline with `2px` offset
- Divider dots: same size/color as links, non-selectable
- Standard links: Subscription Plans · Usage Policy · FAQ · Blog

### Attribution Modal

- Backdrop: fixed, full-screen, `rgba(0,0,0,0.45)`, centered content, `1.25rem` padding
- Modal card: white bg, `--ftu-radius-modal` rounded, `1.25rem` padding, `0.875rem` gap, notification shadow
- Title: `1.125rem`, weight 800, `--ftu-secondary` color
- Close button: top-right, grey icon, hover turns `--ftu-secondary`
- Description: `0.8125rem`, `1.5` line-height
- Attribution box: `--ftu-lighter` bg, `1px --ftu-light-grey` border, `--ftu-radius-sm` rounded, `0.75rem` padding
- Copy button: grey icon, hover turns `--ftu-primary`, turns `--ftu-green` on copied

### Skeleton Loading Placeholders

Used in place of track items while content loads. Matches exact dimensions of real track items to prevent layout shift.

- **Animation:** Shimmer sweep left-to-right, `1.5s` ease-in-out infinite
- **Colors:** `#f7f7f7` base → `#f2f2f2` highlight → `#f7f7f7` (very subtle, light grey)
- **Default count:** 8 skeleton items

| Element | Specs |
|---------|-------|
| Cover placeholder | `2.75rem` square, `--ftu-radius-sm` rounded |
| Title bar | 65% width, `0.75rem` height |
| Artist bar | 40% width, `0.625rem` height |
| Tag placeholders | Two pills (3rem + 2.25rem), right-aligned column |

All skeleton items have `pointer-events: none`.

### Load More Button

- Full width, `0.5rem` padding, pill-shaped
- `--ftu-lighter` background, `--ftu-grey` text, medium weight, `0.75rem` font
- Hover: `rgba(light-grey, 0.45)` background

---

## Animations

| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| `skeleton-shimmer` | `1.5s` | ease-in-out, infinite | Skeleton loading placeholders |
| `ftu-brightness-pulse` | `750ms` | alternate, infinite | Legacy loading pulse |
| `ftu-fade-in` | `250ms` | linear, forwards | Fade-in on mount |

## Audio Behavior

- **Track switching:** 60ms fade-out via Web Audio API gain node before loading new track, 60ms fade-in on play — eliminates audio pop/blip
- **Pause:** Also fades out to avoid clicks
- **Media Session:** Set `navigator.mediaSession.metadata` with track title, artist names, and cover artwork (sm/md/lg/xl sizes) for Chrome media controls

## State Persistence

All UI state uses `chrome.storage.session` (cleared on browser close):

| Key | What it stores |
|-----|----------------|
| Category order | Shuffled category ID array (re-shuffles on browser restart) |
| Selected category | Current category ID |
| Scroll positions | Vertical track list scroll + horizontal category scroll |
| Related tracks view | Which track's related page is shown, plus previous view for back navigation |
| Track count | Number of loaded tracks (for restoring scroll position with enough content) |

## External Links

Standard outbound links used across all apps:

| Label | URL |
|-------|-----|
| Subscription Plans | `https://freetouse.com/music/plans` |
| Usage Policy | `https://freetouse.com/usage-policy` |
| FAQ | `https://freetouse.com/faq` |
| Blog | `https://freetouse.com/blog` |
| Purchase License | `https://freetouse.com/music/{artist-slug}/{title-slug}/license` |

Slugs are lowercase, spaces replaced with dashes, non-alphanumeric characters removed.

## Icons

Icons are inline SVGs from Bootstrap Icons. Key icons used:

| Icon | Usage | Size |
|------|-------|------|
| Arrow right | "Find Similar" action link | 12px |
| Bag fill | Purchase license button | 17-20px |
| Download arrow | Download button | 26px (list), matches play button size (player) |
| Play / Pause | Player controls | 20-24px |
| Search (magnifier) | Search input | 16px |
| X | Clear search, close modal | 16-20px |
| Arrow left | Back navigation | 17px, with 2px bottom margin for alignment |
| Clipboard | Copy attribution | 16px |
