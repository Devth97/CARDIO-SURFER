# Google Play Packaging Design

**Goal:** Package the already-deployed Subway Fit / Cardio Surfer web app (live at `https://subway-fit-frontend.subway-fit-worker.workers.dev`) as an Android app and take it through to a public Google Play Store listing, on top of the current feature set (Google Sign-In, weekly/all-time leaderboard, calorie tracking, ad-placeholder). Payment integration and the paid weekly contest (₹50 entry, ₹1000 winner payout) are explicitly out of scope — deferred to a later phase so the current build can start collecting real users sooner.

**Non-goal for this spec:** actually clicking "Submit for review" in Play Console. Everything up to and including a signed, installable `.aab` and a fully drafted store listing is in scope; the submission itself is a manual, explicit go/no-go the user makes once they've confirmed a working play session on a real device.

---

## Architecture

The app ships as a **Capacitor** wrapper around the existing live website, configured in **remote-URL mode**: the native shell's WebView loads `https://subway-fit-frontend.subway-fit-worker.workers.dev` directly, rather than bundling a local copy of `dist/`. This preserves the property that mattered most during the recent blank-screen bug hunt: a pure web-side fix (like the one just shipped) goes live for every installed user immediately, with no new Play Store build or review cycle. Capacitor still gives a real native shell — app icon, splash screen, and (later) native plugin access for Google Play Billing when the paid-contest phase happens — which a plain browser bookmark or TWA-without-payments-support wouldn't.

The gameplay itself needs no code changes: camera permission prompts, calibration, and gameplay behave identically inside a WebView as in mobile Chrome, since it's the same web platform APIs (`getUserMedia`, WebAssembly, Canvas/WebGL) either way.

**Sign-in is the one path that does need a change — this is a real risk, not a formality.** Google has blocked OAuth sign-in from "embedded user agents" (plain WebViews) since 2016 as an anti-phishing measure: Google's own sign-in page detects it's being rendered inside an embedded WebView and refuses with `Error 403: disallowed_useragent`, rather than actually showing the login form. This would break the existing `signInWithPopup` call in `useAuth.ts` if left unchanged inside a stock Capacitor WebView — Chrome and Custom Tabs are exempt (which is part of why TWA sidesteps this automatically), but a plain embedded WebView is not.

**Mitigation:** add a native Google Sign-In plugin (`@capacitor-firebase/authentication`, which wraps the platform's native Google Sign-In SDK) and branch `useAuth.ts`'s `signIn()` on `Capacitor.isNativePlatform()` — native platforms get a real native credential flow whose resulting token is handed to Firebase via `signInWithCredential`, while the web deployment keeps using `signInWithPopup` unchanged. This is a small, contained code change, not a redesign, but it must be validated on a real device before any other packaging work (icons, CI, store listing) is worth investing in — see Validation Spike below.

## Validation Spike (do this before anything else)

Because the Google Sign-In risk above is the single most likely thing to break in a way that isn't visible from a web browser, the first implementation step is a minimal spike, not the full build: a bare Capacitor shell with just the native auth plugin wired in, tested on a real Android device for exactly this sequence — **install → open app → Google Sign-In → camera permission → calibration → one full run → score submitted → leaderboard updates → close/reopen app → still signed in.** Icons, splash screen, the GitHub Actions pipeline, and store listing content are all worth building — but only after this specific flow is confirmed working on a real device, since a failure here would change the design (e.g. a different auth plugin, or reconsidering TWA after all) rather than just being a bug to patch later.

## Components

**`android/` (new, Capacitor-generated)** — the native Android project (Gradle build, `AndroidManifest.xml`, resource folders for icons/splash). Lives alongside the existing `package.json`/`src/` in the frontend project root.

**`capacitor.config.ts` (new)** — declares `appId: 'com.cardiosurfer.app'`, `appName: 'Cardio Surfer'`, and `server.url` pointing at the production URL.

**`AndroidManifest.xml` permissions** — `INTERNET` (already implied by any WebView app) and `CAMERA`, plus a `<uses-feature android:name="android.hardware.camera" android:required="true" />` declaration. `required="true"` is a deliberate product choice, not an unexamined default: it excludes camera-less Android devices from installing the app at all, which is correct here since the entire game is unplayable without a camera. Capacitor's default `WebChromeClient` bridges the WebView's `getUserMedia` permission prompt to Android's native runtime permission dialog — standard, well-supported Capacitor behavior, not custom code — though this should be explicitly confirmed during the Validation Spike alongside the sign-in flow, not assumed.

**App icon & splash screen** — generated from the existing `public/logo.png` (1254×1254) via Capacitor's asset-generation tooling, producing all required Android density buckets plus the 512×512 Play Store listing icon.

**`.github/workflows/android-build.yml` (new)** — GitHub Actions workflow: checkout → `npm ci` → `npx cap sync android` → `./gradlew bundleRelease` (signed via a keystore decoded from an encrypted repo secret) → uploads the resulting `.aab` as a downloadable workflow artifact. Triggered manually (`workflow_dispatch`) rather than on every push, since a new native build is only needed when something in the native shell itself changes (icon, permissions, app ID) — not for ordinary gameplay/web fixes, which the remote-URL architecture already ships instantly.

**Signing keystore** — generated once (locally, via `keytool`), never committed to the repo (`.jks`/`.keystore` files and any `key.properties` containing passwords are added to `.gitignore` explicitly). Stored as four separate GitHub Actions secrets — `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` — decoded at build time inside the workflow. **Critical:** the user keeps a secure offline backup of the raw keystore file and its passwords outside of GitHub entirely (e.g. a password manager or encrypted drive) the moment it's generated. Losing this file means losing the ability to publish updates to the same app listing — recovering from that requires a Google Play support process, not something to rely on.

**`/privacy` page (new, hosted on the existing deployed site)** — a static route added to the frontend. Must cover, precisely and completely (not just the headline camera claim):
- Google account information used for authentication (name, email, profile photo)
- The user identifier (Firebase UID) tying gameplay data to an account
- Gameplay stats sent to the backend: score, calories, run duration
- Leaderboard visibility (display name/score shown to other users)
- Camera permission and on-device processing: **camera video is processed locally via MediaPipe for pose detection and is never uploaded, transmitted, or stored anywhere** — only make this claim because it is genuinely how `PoseTracker.ts` behaves today, not as boilerplate
- Third-party services involved (Firebase Auth, Cloudflare Workers/D1)
- Data retention/deletion (what happens to a user's data if they stop using the app — worth a concrete answer, not a placeholder, before this goes live)
- No analytics/crash reporting is currently integrated — state that plainly rather than omitting the topic

**Store listing content (drafted by Claude, approved by user)** — title "Cardio Surfer", Health & Fitness category, short/long description, and the privacy policy URL above. The description explicitly calls out the camera requirement up front (e.g. "uses your camera to detect movement during gameplay — video is processed on your device and never uploaded") so the permission prompt isn't a surprise. Screenshots: 2-3 real gameplay captures the user provides from their own phone, plus Start/Leaderboard/Game Over screens captured via headless browser automation (no camera needed for those).

**Content rating questionnaire** — filled out by the user directly in Play Console; Claude provides guidance on each answer but cannot submit it on the user's behalf (it's tied to the developer's Google identity).

## Data Flow

The native Android layer does not independently collect or transmit any gameplay data of its own. The WebView loads the existing production web application, which continues to communicate with Firebase and the existing backend exactly as the web version does — the Android shell is a delivery mechanism, not a new data path. The one exception is sign-in, per the Validation Spike above: if the native auth plugin mitigation is needed, that specific flow goes through a native SDK rather than the WebView, exchanging a native credential for a Firebase ID token via `signInWithCredential` — everything downstream of that (leaderboard, run submission) is unchanged. No addition to Firebase's authorized-domains list is needed for the WebView traffic itself, since it loads the already-authorized `subway-fit-frontend.subway-fit-worker.workers.dev` origin rather than a new `capacitor://` or `file://` origin.

## Error Handling

Camera-permission denial, sign-in failure, and network errors are already handled by the existing web app (Task 8/10 of the frontend plan) and behave identically inside the WebView. The one Android-specific failure mode worth naming: if the device's WebView build is old enough to lack full `getUserMedia`/WebAssembly support, the app would show the same "Could not start camera or pose landmarker" fallback message the web app already has — no special handling needed, but worth a manual check on one older test device if the user has one available.

## Testing

Manual only, matching the pattern already established for this project (no real camera in Claude's environment). The critical end-to-end check, run first as the Validation Spike and again on the final build before considering public submission:

**Install `.aab` → open app → Google Sign-In → camera permission → calibration → complete one game → calories calculated → score submitted → leaderboard updated → close/reopen app → still signed in and everything still works.**

Only once that full sequence passes on a real Android device is it worth moving on to icons, splash screen polish, the GitHub Actions pipeline, and store listing content.

## Out of Scope

- Payment integration and the paid weekly contest (Phase 2, explicitly deferred by the user).
- A bundled/offline Capacitor mode (rejected in favor of remote-URL mode — see Architecture).
- Actually submitting the listing for Google's review (a final manual step, gated on the user's own confirmation of a working device test).
- iOS packaging (not requested).
