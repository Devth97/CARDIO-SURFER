# Google Play Packaging Design

**Goal:** Package the already-deployed Subway Fit / Cardio Surfer web app (live at `https://subway-fit-frontend.subway-fit-worker.workers.dev`) as an Android app and take it through to a public Google Play Store listing, on top of the current feature set (Google Sign-In, weekly/all-time leaderboard, calorie tracking, ad-placeholder). Payment integration and the paid weekly contest (₹50 entry, ₹1000 winner payout) are explicitly out of scope — deferred to a later phase so the current build can start collecting real users sooner.

**Non-goal for this spec:** actually clicking "Submit for review" in Play Console. Everything up to and including a signed, installable `.aab` and a fully drafted store listing is in scope; the submission itself is a manual, explicit go/no-go the user makes once they've confirmed a working play session on a real device.

---

## Architecture

The app ships as a **Capacitor** wrapper around the existing live website, configured in **remote-URL mode**: the native shell's WebView loads `https://subway-fit-frontend.subway-fit-worker.workers.dev` directly, rather than bundling a local copy of `dist/`. This preserves the property that mattered most during the recent blank-screen bug hunt: a pure web-side fix (like the one just shipped) goes live for every installed user immediately, with no new Play Store build or review cycle. Capacitor still gives a real native shell — app icon, splash screen, and (later) native plugin access for Google Play Billing when the paid-contest phase happens — which a plain browser bookmark or TWA-without-payments-support wouldn't.

No changes are needed to the web app's own code for this to work; the game already handles camera permission prompts, calibration, and gameplay identically regardless of whether it's opened in mobile Chrome or inside a WebView, since it's the same web platform APIs (`getUserMedia`, WebAssembly, Canvas/WebGL) either way.

## Components

**`android/` (new, Capacitor-generated)** — the native Android project (Gradle build, `AndroidManifest.xml`, resource folders for icons/splash). Lives alongside the existing `package.json`/`src/` in the frontend project root.

**`capacitor.config.ts` (new)** — declares `appId: 'com.cardiosurfer.app'`, `appName: 'Cardio Surfer'`, and `server.url` pointing at the production URL.

**`AndroidManifest.xml` permissions** — `INTERNET` (already implied by any WebView app) and `CAMERA`, plus a `<uses-feature android:name="android.hardware.camera" android:required="true" />` declaration. Capacitor's default `WebChromeClient` bridges the WebView's `getUserMedia` permission prompt to Android's native runtime permission dialog — this is standard, well-supported Capacitor behavior, not custom code.

**App icon & splash screen** — generated from the existing `public/logo.png` (1254×1254) via Capacitor's asset-generation tooling, producing all required Android density buckets plus the 512×512 Play Store listing icon.

**`.github/workflows/android-build.yml` (new)** — GitHub Actions workflow: checkout → `npm ci` → `npx cap sync android` → `./gradlew bundleRelease` (signed via a keystore decoded from an encrypted repo secret) → uploads the resulting `.aab` as a downloadable workflow artifact. Triggered manually (`workflow_dispatch`) rather than on every push, since a new native build is only needed when something in the native shell itself changes (icon, permissions, app ID) — not for ordinary gameplay/web fixes, which the remote-URL architecture already ships instantly.

**Signing keystore** — generated once (locally, via `keytool`), never committed to the repo. Stored as a base64-encoded GitHub Actions secret alongside its store/key passwords and key alias, decoded at build time inside the workflow.

**`/privacy` page (new, hosted on the existing deployed site)** — a static route added to the frontend covering: what Google Sign-In collects, that gameplay stats (score, calories, duration) are sent to the leaderboard backend, and — the point most likely to concern a reviewer or a user — that camera video is processed live, on-device, via MediaPipe, and is never uploaded, transmitted, or stored anywhere.

**Store listing content (drafted by Claude, approved by user)** — title "Cardio Surfer", Health & Fitness category, short/long description, and the privacy policy URL above. Screenshots: 2-3 real gameplay captures the user provides from their own phone, plus Start/Leaderboard/Game Over screens captured via headless browser automation (no camera needed for those).

**Content rating questionnaire** — filled out by the user directly in Play Console; Claude provides guidance on each answer but cannot submit it on the user's behalf (it's tied to the developer's Google identity).

## Data Flow

No new data flows are introduced. The Android app is a thin native shell; all network traffic (Firebase Auth, the leaderboard API, gameplay run submission) flows exactly as it does today from a mobile browser, just from inside a WebView instead of Chrome. The one addition to Firebase's authorized-domains list needed for this is **none** — Capacitor's WebView uses the same origin (`subway-fit-frontend.subway-fit-worker.workers.dev`) already authorized for the web deployment, since it's loading that exact URL rather than a new `capacitor://` or `file://` origin (a consequence of choosing remote-URL mode over bundled mode).

## Error Handling

Camera-permission denial, sign-in failure, and network errors are already handled by the existing web app (Task 8/10 of the frontend plan) and behave identically inside the WebView. The one Android-specific failure mode worth naming: if the device's WebView build is old enough to lack full `getUserMedia`/WebAssembly support, the app would show the same "Could not start camera or pose landmarker" fallback message the web app already has — no special handling needed, but worth a manual check on one older test device if the user has one available.

## Testing

Manual only, matching the pattern already established for this project (no real camera in Claude's environment): user builds the `.aab` via the GitHub Actions workflow, sideloads it (or uses Play Console's internal testing track) onto their own phone, and runs through the same smoke-test checklist already used for the web deployment (sign-in, leaderboard, a full gameplay run, calorie/rank display).

## Out of Scope

- Payment integration and the paid weekly contest (Phase 2, explicitly deferred by the user).
- A bundled/offline Capacitor mode (rejected in favor of remote-URL mode — see Architecture).
- Actually submitting the listing for Google's review (a final manual step, gated on the user's own confirmation of a working device test).
- iOS packaging (not requested).
