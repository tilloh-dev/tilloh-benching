# BenchyOS design system

BenchyOS looks like a terminal that grew a desktop: square, monospaced, compact, one amber accent, flat pixel icons, dark and light. This page is the rulebook for every UI change. Tokens live in [`src/lib/design/tokens.css`](../src/lib/design/tokens.css); the living reference is the **Design system** app inside BenchyOS (Start → Design system).

## Principles

1. **Results first, with hierarchy.** Surfaces step up in four levels and status, scores and identity hues add color, so the eye finds what matters before reading.
2. **One accent, one job.** Amber marks what you can act on or where you are — never decoration.
3. **Square and flat.** No rounded corners, no gradients, no glow, no soft shadows.
4. **Dense but legible.** Compact spacing on a 2 px grid; a table row is 26 px.
5. **Both themes are first-class.** Every change is checked in dark and light.

## Tokens — use names, never values

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--sunken`, `--hover` | desktop · windows and panels · bars, cards, inactive title bars, secondary buttons · focused title bar and table headers · inputs, code, tracks · hover fill |
| Lines | `--line`, `--line-soft`, `--line-strong` | borders · dividers inside a surface · control borders and the focused window |
| Text | `--fg`, `--fg-2`, `--fg-3`, `--fg-4` | primary · secondary · labels and meta · disabled and placeholders |
| Accent | `--accent`, `--accent-text`, `--accent-fg`, `--accent-soft` | see *Accent* below |
| Status | `--ok`, `--warn`, `--bad`, `--info`, `--muted` | check and run states only |
| Status fills | `--ok-soft`, `--warn-soft`, `--bad-soft`, `--info-soft` | background of status badges, issue rows, notices |
| Identity hues | `--hue-1` … `--hue-8` | icons, blueprint kinds, chart series — what a thing *is*, never how it *went* |
| Data | `--data`, `--track`, `--score-1` … `--score-5` | bars and charts · empty meter · score scale |
| Type | `--font`, `--fs-xs` … `--fs-xxl`, `--fw`, `--fw-strong` | one family (IBM Plex Mono), body is `--fs-m` (12.5 px) |
| Space | `--sp-1` (2) … `--sp-7` (24 px) | paddings and gaps |
| Size | `--control-h`, `--row-h`, `--titlebar-h`, `--topbar-h`, `--taskbar-h` | fixed heights |
| Motion | `--dur-1` … `--dur-3`, `--steps`, `--ease` | see *Motion* |

A hex value, `px` spacing outside the scale, `border-radius`, `linear-gradient` or `box-shadow` other than `--shadow-pop` in a component is a review finding. The one exception is SVG artwork that needs literal colors.

## Accent

Amber is reserved for four things:

| Where | How |
|---|---|
| The **primary action** of a view (at most one) | `Button variant="primary"`: filled `--accent`, text `--accent-fg` |
| The **active tab** or active taskbar button | 2 px `--accent` underline |
| The **selection mark** (selected row, list item, desktop icon) | 2 px `--accent` bar on the left or `--accent` border, fill `--accent-soft` |
| **Focus** | 1 px `--focus` outline |

Everything else — headings, icons, links in running text, badges — stays neutral. A second amber element in the same view means one of them is wrong.

## Status and scores

- **Status** (`ok · warnings · broken · failed`, run states) uses `--ok`, `--warn`, `--bad`, `--muted` on a matching `-soft` fill, always with a **symbol** so it never depends on color: `●` ok, `▲` warnings, `✕` broken/failed, `○` pending, and the `Busy` dot ring for running.
- **Scores** use a five-step scale from `scoreStep()` in `src/lib/design/score.ts`: `<20`, `<40`, `<60`, `<80`, `≥80` → `--score-1` … `--score-5`. The number is always printed; color only supports it.
- **Data bars** use `--data` on `--track`. They are not status and never use the accent.

## Levels and color

Four surface levels make hierarchy visible without borders doing all the work: `--bg` (desktop) → `--surface` (window body) → `--surface-2` (bars, cards) → `--surface-3` (focused title bar, table headers). The focused window is the only one with a `--surface-3` title bar.

Three kinds of color, each with one meaning:

| Kind | Tokens | Means |
|---|---|---|
| Accent | `--accent` | act here / you are here |
| Status | `--ok` … `--bad` + `-soft` fills | how something went |
| Identity | `--hue-1` … `--hue-8` | what something is (icon, blueprint kind, series) |

Identity hues are assigned, not chosen per screen: icons derive theirs from the icon name (`iconHue()` in `Icon.svelte`), blueprint kinds have a fixed hue in `Kind.svelte`.

## Type

- One family: **IBM Plex Mono**, weights 400 and 600.
- Sizes: `--fs-m` body, `--fs-s` meta and table headers, `--fs-xs` uppercase labels and badges, `--fs-l` window headings, `--fs-xl`/`--fs-xxl` for big numbers.
- Numbers are tabular (`font-variant-numeric: tabular-nums`) wherever they line up.
- Uppercase only for tiny labels (`.label`, `.section-title`), with `letter-spacing: 0.04em`.

## Shape and elevation

- Corners are square (`border-radius: 0` is set globally).
- Every surface is separated by a **1 px line**, not by shadow.
- The focused window gets `--line-strong` and a `--surface-3` title bar; inactive windows `--line`, `--surface-2`, and a dimmed app icon.
- Maximized and snapped windows fill the desktop area exactly (no margin).
- Floating things that overlap content (menus, palette, start menu, tooltips) get `--shadow-pop`: a hard 3 px offset, the only shadow in the system.

## Spacing and density

Compact on a 2 px grid. Defaults:

| Element | Height | Padding |
|---|---|---|
| Button, input, select | `--control-h` 24 px | `0 --sp-4` |
| Small button | `--control-h-s` 20 px | `0 --sp-3` |
| Table row, list item | `--row-h` 26 px | `0 --sp-4` |
| Window title bar | `--titlebar-h` 28 px | `0 --sp-4` |
| Panel / card | — | `--sp-4 --sp-5` |

## Icons

- **12×12 pixel icons** from `src/lib/os/pixel-icons.ts`, rendered by `Icon.svelte`. Each icon has a stable identity hue derived from its name.
- Sizes are integer multiples only: **12 px** inline, **24 px** in toolbars and tiles, **36 px** on the desktop. Anything else blurs the pixels.
- `mono` icons inherit the text color: window controls and icons on a filled primary button.
- New icon: draw it on the 12×12 grid in `pixel-icons.ts`, 1 px strokes, 1 px padding, and check it in the Design system app at 1× in both themes.

## Motion

Two kinds, nothing else:

| Kind | Where | How |
|---|---|---|
| **Functional** | hover, press, menu open, tab change | ≤ `--dur-2`, opacity or color only, no movement |
| **Retro moments** | window open/minimize, boot, the command-palette caret, live runs | stepped: `steps(var(--steps))` with `step-unfold`/`step-fold`, `caret`, `blink` |

- Only things that are **running** animate continuously. The running indicator is `Busy` (`src/lib/ui/Busy.svelte`): eight pixel dots on a circle that grow and shrink one after another. Status badges, busy buttons and the judge menu all use it; live LEDs and matrix cells use `blink`.
- `prefers-reduced-motion` sets every duration to 0 — keep all motion token-based so this works.

## Themes

- Dark is the default; light is **warm paper**. With no choice made, BenchyOS follows the OS (`prefers-color-scheme`); the top-bar toggle cycles system → dark → light and remembers the choice (`src/lib/design/theme.svelte.ts`).
- Themes only swap token values. A component that needs `[data-theme='light']` in its own CSS is using a raw value.

## Components

Build from these before writing new styles (`src/lib/ui/`, `src/lib/os/`):

| Component | Use |
|---|---|
| `Button` | `default` · `primary` (one per view) · `ghost` (toolbars) · `danger` |
| `Status` | every status or run state, with symbol |
| `Score` | every 0–100 score: number, meter, gate marker |
| `Tabs`, `Segmented`, `Toggle` | navigation inside a window · exclusive options · booleans |
| `Toolbar`, `Split`, `ListItem`, `Empty`, `Spinner` | window layout · master/detail · selectable rows · empty and loading states |
| `Code`, `Markdown`, `JsonTree` | source, prose, structured data |
| `Window`, `Menu`, `PixelIcon` | the OS layer |

## Checklist for a UI change

- [ ] Only tokens; no raw colors, radii, gradients or soft shadows
- [ ] At most one amber element per view, and it is one of the four accent uses
- [ ] Status carries a symbol, scores print the number
- [ ] Icons at 12/24/36 px
- [ ] Looks right in dark **and** light (Design system app has a side-by-side)
- [ ] Motion uses the duration tokens; nothing moves that is not running or opening
