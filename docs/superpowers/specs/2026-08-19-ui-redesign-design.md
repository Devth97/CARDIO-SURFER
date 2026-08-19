# 2D UI Redesign — "Sunny Arcade" — Design

**Status:** Draft for review
**Date:** 2026-08-19
**Depends on:** none (purely visual/CSS work on the existing, already-deployed frontend)

## 1. Background

Cardio Surfer's 3D game world (`src/game/ThreeRenderer.ts`) is a bright, sunny, primary-color cartoon-arcade look — sky blue, sand, red, green, gold — genuinely close to the real Subway Surfers' visual identity. The 2D React overlay UI wrapped around it (start screen, sign-in, calibration, leaderboard, game-over, tutorial modal) drifted somewhere else entirely: dark violet-black gradient backgrounds, neon cyan/magenta/purple glow, `backdrop-filter: blur()` glassmorphism panels, and six separate `Sparkles` icon usages plus emoji flourishes (✨💡🔥). These are recognizable "generic AI-vibe-coded app" visual tells, and they clash with the 3D world rather than extending it. This redesign brings the 2D UI's palette and visual language into alignment with the game it wraps.

Confirmed via a live screenshot of the deployed start screen (2026-08-19) and code search across `src/App.css` (the app's single, 1320-line stylesheet — no design-token system exists today) and every component under `src/components/`.

## 2. Goals

1. Replace the dark violet/neon visual language on every 2D overlay screen with a palette drawn directly from the existing 3D game world.
2. Remove every instance of the "AI vibe-coded" clichés identified: glassmorphism blur panels, neon glow box-shadows, `Sparkles` icons, and decorative emoji flourishes.
3. Introduce a small CSS custom-property (design token) layer so the new palette lives in one place instead of being repeated as hardcoded hex values across the stylesheet — a natural cleanup given this pass touches nearly every rule in `App.css` anyway.
4. End up with something that reads as "the same energy as the actual Subway Surfers menus," not just "less neon."

## 3. Non-goals

- The app icon and splash screen are explicitly **excluded** — user wants to keep the existing icon as-is. (Task 3b, the pre-existing icon/splash defect list from the Play Store packaging plan, remains open and separate.)
- The 3D game rendering (`ThreeRenderer.ts`) is not touched — it's already the reference palette everything else is matching toward, not something being changed itself.
- No new screens, features, or copy changes. Purely visual/CSS restyling of what already exists.
- No component restructuring beyond what's needed to drop removed elements (e.g. deleting a `Sparkles` import) — this is a visual pass, not a refactor.

## 4. Visual language

**Palette** (as CSS custom properties on `:root`, replacing hardcoded hex throughout `App.css`):

| Token | Value | Used for |
|---|---|---|
| `--color-sky-top` | `#4fc3f7` | Screen background gradient, top |
| `--color-sky-mid` | `#29b6f6` | Screen background gradient, middle |
| `--color-sky-bottom` | `#1e88e5` | Screen background gradient, bottom |
| `--color-accent-red` | `#e53935` | Primary accent (scores, key numbers, alerts) |
| `--color-accent-gold` | `#ffd700` | Rank #1 / highlight accents |
| `--color-accent-gold-btn` | `#ffca28` → `#ff9800` (gradient) | Primary buttons |
| `--color-accent-green` | `#43a047` | Success / positive states |
| `--color-card-bg` | `#fff8e1` | Solid card/panel background (replaces blur panels) |
| `--color-text-dark` | `#5d4037` | Body text on light card backgrounds |
| `--color-title-fill` | `#ffeb3b` | Title text fill |
| `--color-title-stroke` | `#1a237e` | Title text outline (`-webkit-text-stroke`) |

Every other color used in `App.css` today (the `#080711`/`#1b1536` dark backgrounds, `#00f0ff`/`#d000ff`/`#ff00c8`/`#ff0055` neon accents) is removed, not just deprioritized — no dark-mode variant of this UI is being kept.

**Typography:** existing font stack (`system-ui, -apple-system, 'Segoe UI', Roboto, ...`) stays for body text. Titles/headings use a bold, heavy weight (`font-weight: 900`, current title elements already lean this direction) with the gold-fill/navy-outline treatment shown in the approved mockups, replacing the current amber gradient title fill.

**Shapes & effects:**
- Buttons: solid gradient fill (gold→orange), 3px white border, hard drop-shadow (`box-shadow: 0 5px 0 <darker-shade>`) instead of soft glow. No `border-radius` change needed — existing pill shape stays.
- Cards/panels: solid or near-solid (`rgba(255,255,255,.92)+`) light backgrounds, no `backdrop-filter: blur()` anywhere.
- Icon badges (rank circles, stat chips): solid color fills matching the palette above, no glow border.
- Remove entirely: every `box-shadow` rule using `rgba(0,240,255,...)`, `rgba(180,0,255,...)`, `rgba(255,0,200,...)`, or similar neon values; the `logoPulse` and `flamePulse` glow keyframe animations; all six `Sparkles` icon usages (`CalibrationScreen.tsx`, `GameOverScreen.tsx`, `TutorialGuideModal.tsx`) and their imports; the emoji flourishes (✨ in copy text, 💡, 🔥 comment/copy).
- Confetti (`GameOverScreen.tsx`) keeps its function but its color array changes from `['#00f0ff', '#ff00c8', '#ffea00']` to warm/palette-matching colors, e.g. `['#ffd700', '#e53935', '#4fc3f7', '#43a047']`.

## 5. Scope — screens covered

All existing 2D overlay screens get the full treatment, confirmed with the user via mockups before writing this spec:

- **Start screen** (`StartScreen.tsx`) — approved via mockup.
- **Leaderboard screen** (`LeaderboardScreen.tsx`) — approved via mockup (tab toggle, ranked rows, "You" row highlight).
- **Game-over screen** (`GameOverScreen.tsx`) — approved via mockup (score, stat tiles, play-again button).
- **Sign-in screen** (`SignInScreen.tsx`) — same treatment, no mockup shown but confirmed in scope; follows the same card/button language as the approved screens.
- **Calibration screen** (`CalibrationScreen.tsx`) — same treatment; also the screen where the `Sparkles` badge removal applies (already simplified in an earlier pass that removed the redundant T-pose step, this restyles what remains).
- **Tutorial modal** (`TutorialGuideModal.tsx`) — same treatment; drop its `Sparkles` icon.

**Explicitly excluded:** app icon, splash screen (both stay as currently shipped), and the 3D game canvas itself.

## 6. Technical approach

Add a `:root` custom-property block at the top of `src/App.css` with the tokens from §4, then replace hardcoded hex values throughout the file with `var(--token-name)` references, screen by screen, removing the dark/neon rules as they're encountered rather than leaving them dead in the stylesheet. Component-level changes (icon import removal, confetti color array, any copy text with emoji flourishes) happen alongside the CSS changes for whichever screen they live in — no separate pass needed.

No new dependencies, no build config changes. This is a `src/App.css` + six component files change, verified visually screen-by-screen against the approved mockup directions (§5) rather than against pixel-exact mockup reproduction — the mockups establish the direction, not a literal spec to trace.

## 7. Verification

Since this is purely visual, verification is screenshot-based rather than automated: after implementation, capture the same six screens live (via headless browser, matching how the "before" reference screenshot was taken for this design) and visually confirm against the approved direction — sky-blue palette present, no dark/neon backgrounds remaining, no `Sparkles`/emoji flourishes remaining, cards solid (no blur) — before considering this done.
