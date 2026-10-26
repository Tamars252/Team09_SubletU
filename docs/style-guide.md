# SubletU Style Guide

This guide documents SubletU's visual identity and the design tokens the web app
is built on. **`web/src/styles/theme.css` is the source of truth** — every token
below is copied verbatim from the `:root` block of that file. If a value here
disagrees with `theme.css`, `theme.css` wins.

**Brand direction:** warm terracotta on a cream ground, set in Fraunces
(display) and Inter (body). The palette is deliberately low-contrast and
paper-like; terracotta is the only saturated colour and is reserved for the
primary action, active state, and brand mark.

---

## Colour

Primary pairing: **`--terracotta` `#d4603a` on `--cream` `#fbf8f4`.** This is the
brand lockup — terracotta type, buttons, and accents sit on a cream surface.
White (`#fff`) is used directly for raised surfaces (cards, inputs, bubbles) and
is not tokenised.

| Token | Value | Purpose / when to use |
| --- | --- | --- |
| `--terracotta` | `#d4603a` | Primary brand colour. Primary buttons, links, active nav/chips/toggles, focus borders, logo mark, unread dots. |
| `--terracotta-dark` | `#b84e2c` | Primary button hover; text on tinted (blush) chips and avatars. |
| `--terracotta-light` | `#e8956e` | Mid-stop in the swipe-card photo gradient. |
| `--blush` | `#f2d4c7` | Soft terracotta tint: secondary/icon button hover, avatar background, tint chips, spinner track, thumbnail gradient end. |
| `--cream` | `#fbf8f4` | App background and primary surface. Header, nav, bottom sheets, chat compose bar, thread rows. |
| `--sand` | `#f5f0ea` | Secondary surface one step down from cream: secondary buttons, icon buttons, chips, fact tiles, photo slots, tab tracks. |
| `--shell` | `#f0ebe3` | Page background outside the 480px app frame on wide (≥900px) viewports. |
| `--line` | `#e8e0d6` | Default 1px borders and dividers: cards, header/nav edges, inputs, list rows. |
| `--line-strong` | `#d1c7bb` | Heavier borders and inactive controls: ghost buttons, outline chips, toggle off state, grips, disabled send button, code-input placeholder. |
| `--ink` | `#2d3436` | Primary text colour (set on `body`). Also the campus map marker fill. |
| `--slate` | `#636e72` | Secondary text: labels, descriptions, meta rows, `.muted`. |
| `--mist` | `#b2bec3` | Tertiary text: hints, placeholders, timestamps, inactive nav items, `.tiny`. |
| `--green` | `#3a8d5c` | Success / positive state: "LIKE" stamp, verified badges, saved map pins. |
| `--green-bg` | `#d4eddf` | Success surface: success banners, `.chip.good`. |
| `--gold` | `#d4a03a` | Warning accent: swipe-to-archive action background. |
| `--gold-bg` | `#fff3d4` | Info/notice surface: info banners, demo-credentials callout. |
| `--danger` | `#d63031` | Error / destructive state: "NOPE" stamp, pass button, danger text. |
| `--danger-bg` | `#f5d4d1` | Error surface: error banners, `.btn-danger` background. |

---

## Typography

Both families load from Google Fonts in `web/index.html` (with `preconnect` to
`fonts.googleapis.com` and `fonts.gstatic.com`):

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

Loaded weights: Fraunces 600 / 700 / 900 (variable optical size 9–144), Inter
400 / 500 / 600 / 700. Only these weights are available — do not use others.

| Token | Value | Purpose / when to use |
| --- | --- | --- |
| `--font-display` | `"Fraunces", Georgia, serif` | Headings and brand type: wordmark, auth logo, section/sheet/card titles, prices, numeric facts, swipe stamps. |
| `--font-body` | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | All UI and body text. Set on `body`; inherited by buttons, inputs, and textareas. |

There are **no size, weight, or line-height tokens** in `theme.css` — those are
set per component. The global baseline is defined on `html, body`: `font-size:
15px`, `line-height: 1.5`, `color: var(--ink)`, `background: var(--cream)`.

---

## Radius

| Token | Value | Purpose / when to use |
| --- | --- | --- |
| `--radius-sm` | `10px` | Small surfaces: inputs, banners, map suggestion dropdown, demo callout. |
| `--radius` | `16px` | Default radius: buttons, cards, list cards, map search bar, map sheet, inline detail map. |
| `--radius-lg` | `24px` | Large surfaces: swipe cards. |
| `--radius-xl` | `32px` | Top corners of the bottom sheet (filters). |

Pill shapes (`999px`), circles (`50%`), and a few one-off `12px` corners are
written literally in component rules rather than tokenised.

---

## Shadow

All shadows are tinted with `--ink` (`rgba(45, 52, 54, …)`) rather than pure
black, to stay consistent with the warm palette.

| Token | Value | Purpose / when to use |
| --- | --- | --- |
| `--shadow-sm` | `0 1px 3px rgba(45, 52, 54, 0.08)` | Subtle lift on small elements: toggle knob, range thumb, photo badges, active tab pill. |
| `--shadow` | `0 4px 16px rgba(45, 52, 54, 0.1)` | Default elevation: floating controls, map search bar and pins, deck buttons, list-card hover, SSO button. |
| `--shadow-lg` | `0 12px 40px rgba(45, 52, 54, 0.16)` | Highest elevation: the desktop app frame, map detail sheet. |
| `--shadow-card` | `0 8px 32px rgba(45, 52, 54, 0.14)` | Reserved for the swipe card stack. |

Terracotta-tinted glows on primary buttons (`rgba(212, 96, 58, …)`) are written
inline in `theme.css` and are not tokenised.

---

## Layout

| Token | Value | Purpose / when to use |
| --- | --- | --- |
| `--nav-height` | `68px` | Height of the fixed bottom tab bar (`.nav`). |
| `--header-height` | `60px` | Height of the top app bar (`.header`). |

The app shell itself is capped at `max-width: 480px` (and `min(940px, 100vh)`
tall above 900px) directly in `.app`; those are not tokens.

---

## Usage Guidelines

1. **Use `var(--token)`, never a raw hex.** If a colour you need isn't in
   `theme.css`, add a token there first rather than hard-coding it in a
   component.
2. **Display font for headings only.** Apply `var(--font-display)` to wordmarks,
   section titles, prices, and numeric facts. Everything else inherits
   `var(--font-body)` from `body` — don't re-declare it except when overriding a
   display context (e.g. the `small` inside `.photo-price`).
3. **One terracotta per view.** `--terracotta` marks the single primary action or
   active state. Secondary actions use `--sand` / `--blush`; tertiary use the
   `.btn-ghost` pattern — transparent fill, `--slate` text, `--line-strong`
   border.
4. **Text hierarchy is three steps:** `--ink` for primary, `--slate` for
   secondary, `--mist` for tertiary. Don't introduce intermediate greys.
5. **Pair state colours with their backgrounds:** `--green` on `--green-bg`,
   `--danger` on `--danger-bg`, warnings on `--gold-bg`. Never put a state
   foreground on cream without its tinted surface.
6. **Surface order is cream → sand → white.** Cream is the page, sand is a
   recessed control, white is a raised card. `--shell` only ever appears behind
   the app frame on desktop.
7. **Use the radius and shadow scale, not ad-hoc values.** A new surface should
   pick the nearest existing step rather than inventing one.
8. **Reference `--nav-height` / `--header-height`** when positioning anything
   that must clear the chrome, instead of repeating `68px` / `60px`.

---

## How to update tokens

1. Edit `web/src/styles/theme.css` — it is the only place a token is defined.
2. Update the matching row in this guide (value, and the purpose column if the
   usage changed).
3. If you add or remove a token, update the cross-check counts below.

Never add tokens to a component stylesheet or an inline `style` prop; they won't
be discoverable here.

---

## Cross-check

`theme.css` defines **30** custom properties in `:root`. This guide documents
**30**:

| Category | In `theme.css` | In this guide |
| --- | --- | --- |
| Colour | 18 | 18 |
| Typography | 2 | 2 |
| Radius | 4 | 4 |
| Shadow | 4 | 4 |
| Layout | 2 | 2 |
| **Total** | **30** | **30** |

`web/src/styles/theme.css` is the only stylesheet under `web/src` that declares
custom properties, so this list is complete.

### Items to double-check

- **`--muted` is used but never defined.** `theme.css` references
  `var(--muted)` in six rules (`.auth-tagline`, `.auth-hint`, `.auth-divider`,
  `.auth-tabs button`, `.password-toggle`, `.strength-label`) but there is no
  `--muted` in `:root`. Those elements currently fall back to inherited `--ink`.
  It is likely meant to be `--slate`. Not documented above because it is not a
  defined token.
- **Hex case.** The tokens are written lowercase in `theme.css` (`#d4603a`,
  `#fbf8f4`). The brand spec writes them uppercase (`#D4603A`, `#FBF8F4`) —
  identical colours, and `index.html`'s `theme-color` meta uses the uppercase
  form. Worth normalising one way.
- **Untokenised colours.** `#fff` (surfaces), `#8b1f20` / `#1f5c38` / `#7a5a12`
  (banner text), `#fdf3d6` / `#edd9a3` / `#7a5c14` (dev flag), `#c9c0b7` (SSO
  hover), and the strength-meter ramp `#c9453a` / `#d49a3a` / `#6f9e4c` /
  `#3a8d5c` are literals in `theme.css`. `#3a8d5c` duplicates `--green`
  exactly. Consider tokenising.
- **Duplicate auth blocks.** `theme.css` contains two sections commented
  `auth` (`.auth*` and `.auth-screen`/`.auth-card*`) with overlapping intent —
  no token impact, but a cleanup candidate.
