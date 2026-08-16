# Cardio Surfer — Camera-Controlled 3-Lane Runner

A Subway-Surfers-style endless runner, but every input is a real body
movement read from your webcam instead of a swipe: jump in place, squat to
duck, step/lean sideways to switch lanes. Runs entirely in the browser — no
server, no account, nothing to install beyond `npm`.

This is the **web version**, meant to validate the game feel and the
gesture-tracking logic first. The plan (per our conversation) is: get this
solid on web, then port the same gesture-detection approach into React
Native/Expo for the Play Store / App Store release.

## Run it locally

```bash
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`) in
**Chrome** on a laptop/desktop with a webcam, and allow camera access when
prompted. It needs a real webcam and an internet connection on first load
(the pose-detection model and WebAssembly runtime are fetched from a CDN the
first time you play — after that the browser caches them).

Stand back far enough that your shoulders and hips are both visible in
frame, roughly waist-up.

## Controls

| Action | How to trigger it (camera) | Keyboard fallback (for testing) |
|---|---|---|
| Jump | Jump in place | `↑` or `Space` |
| Duck | Squat down and hold | `↓` (hold) |
| Move left | Step or lean left | `←` |
| Move right | Step or lane right | `→` |

The keyboard fallback exists so you (or anyone testing this) can play and
verify the game logic without a working camera — useful for quick sanity
checks.

## How the tracking works

Full write-up of the pipeline (calibration, per-gesture thresholds, why
each constant is what it is) is in `src/pose/PoseTracker.ts` and
`src/pose/gestureConfig.ts` — the short version:

1. Every frame, MediaPipe's `PoseLandmarker` (running fully on-device, no
   server calls) returns body keypoints.
2. The shoulder/hip midpoint is smoothed (exponential moving average) to
   kill per-frame jitter.
3. A short calibration step (`CalibrationScreen`) captures your neutral
   standing position as a baseline.
4. Each gesture is its own small state machine comparing the smoothed
   position against that baseline, with thresholds expressed as a fraction
   of your own body height (so it works regardless of how far you stand
   from the camera) plus cooldowns/hysteresis so one physical movement
   doesn't fire the same action twice.

All of the thresholds in `gestureConfig.ts` are deliberately pulled out as
named constants — if jump/duck/lane-change feels too sensitive or not
sensitive enough once you try it, that file is the first place to tune.

## Project structure

```
src/
  game/
    types.ts         game-domain types (lanes, obstacles, actions)
    constants.ts      tunable gameplay constants (speed, spawn rate, etc.)
    GameEngine.ts      pure game state machine: lanes, collisions, scoring
    renderer.ts        canvas 2D perspective rendering (no game logic here)
  pose/
    PoseTracker.ts     webcam -> MediaPipe -> gesture events
    gestureConfig.ts   tunable gesture-detection thresholds
  components/          screens + camera preview + HUD (React/UI only)
  App.tsx              screen state machine: start -> calibrate -> play -> gameover
```

`GameEngine` and `PoseTracker` are both framework-agnostic (no React inside
them) on purpose — that's the part that should port over almost unchanged
when we move to React Native, since the gesture math and game rules don't
care what's rendering them.

## Known limitations / next steps

- **Single player, no accounts yet.** Supabase (data) + Firebase (auth) were
  discussed for the next phase — not wired up in this web MVP.
- **Difficulty tuning is a first pass.** Jump/duck/lane thresholds in
  `gestureConfig.ts` will likely need a real tuning pass once you've
  actually played it a few times on your own webcam/lighting/distance.
- **No sound yet.**
- Lighting and camera angle matter a lot for pose accuracy — front-facing,
  well-lit, plain background works best.

## Deploying the web version

Any static host works since this is a pure client-side Vite build:

```bash
npm run build   # outputs to dist/
```

Vercel is a good fit for this (drag-and-drop `dist/`, or connect the repo
for auto-deploys) — separate from the eventual mobile app builds, which
will go through EAS Build/Submit once we port to Expo.
