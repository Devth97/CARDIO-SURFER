# Google Play Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the deployed Subway Fit / Cardio Surfer web app as a Capacitor-based Android app, validate that Google Sign-In and camera-based gameplay both work on a real signed device build, then prepare (but not submit) a full Google Play Store listing.

**Architecture:** Capacitor wraps the existing live site in remote-URL mode (no bundled copy of `dist/`), so ordinary web/gameplay fixes ship instantly with no new native build. The one native-specific code change is Google Sign-In, which needs a native plugin instead of the existing `signInWithPopup` because Google blocks OAuth from embedded WebViews. A GitHub Actions workflow builds the signed `.aab`; the actual Play Store submission is a final manual gate after a real-device test passes.

**Tech Stack:** Capacitor 7 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`), `@capacitor-firebase/authentication` for native Google Sign-In, `keytool` (JDK 17, already installed) for keystore/fingerprint generation, GitHub Actions for the build pipeline.

---

## File structure

```
capacitor.config.ts                        — new, remote-URL config + navigation allowlist
android/                                    — new, Capacitor-generated native project
android/app/src/main/AndroidManifest.xml    — modified, camera/internet permissions
android/app/build.gradle                    — modified, release signing config + Google Services plugin
android/build.gradle                        — modified, Google Services plugin classpath
android/keystore.properties.example         — new, template (real keystore.properties is gitignored)
android/app/google-services.json            — new, gitignored (from Firebase console)
.gitignore                                  — modified, keystore/properties/google-services.json entries
src/firebase/useAuth.ts                     — modified, native-platform sign-in branch
.github/workflows/android-build.yml         — new, signed .aab build pipeline
public/privacy.html                         — new, privacy policy page
docs/store-listing.md                       — new, drafted Play Store listing copy (reference doc)
```

---

### Task 1: Add Capacitor core and the Android platform

**Files:**
- Modify: `package.json`
- Create: `capacitor.config.ts`
- Create: `android/` (generated)

- [ ] **Step 1: Install Capacitor packages**

```bash
cd /i/subway-fit/.worktrees/frontend-auth-leaderboard
npm install @capacitor/core@latest
npm install -D @capacitor/cli@latest
npm install @capacitor/android@latest
```

Expected: all three added to `package.json` (core/android under `dependencies`, cli under `devDependencies`). If a specific version fails to resolve, install the latest available compatible version instead and note the substitution.

- [ ] **Step 2: Create `capacitor.config.ts`**

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cardiosurfer.app',
  appName: 'Cardio Surfer',
  server: {
    url: 'https://subway-fit-frontend.subway-fit-worker.workers.dev',
    allowNavigation: ['subway-fit-frontend.subway-fit-worker.workers.dev'],
  },
};

export default config;
```

- [ ] **Step 3: Add the Android platform**

```bash
npx cap add android
```

Expected: creates `android/` with a full Gradle project. This will fail if no JDK is on `PATH` — confirm first with `keytool -help` (already verified present, JDK 17).

- [ ] **Step 4: Verify the platform was added correctly**

```bash
npx cap sync android
```

Expected: succeeds, prints "Sync finished".

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json capacitor.config.ts android/
git commit -m "android: add Capacitor core and Android platform"
```

---

### Task 2: Add Android manifest permissions

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Locate the manifest and confirm its current root-level structure**

```bash
grep -n "<manifest\|<application" android/app/src/main/AndroidManifest.xml
```

Expected: shows the `<manifest ...>` opening tag and the `<application ...>` tag on separate lines — permissions need to go between them.

- [ ] **Step 2: Add the camera and internet declarations**

Add these lines immediately after the `<manifest ...>` opening tag, before `<application`:

```xml
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera.front" android:required="true" />
```

Note the `.front` suffix: `getUserMedia({ facingMode: 'user' })` in `src/App.tsx` requests the front-facing camera for pose tracking, and plain `android.hardware.camera` in Android's manifest schema specifically means the *back* camera — declaring the wrong one would either wrongly filter out front-camera-only devices from the Play Store listing, or wrongly admit back-camera-only devices that can't actually run the game. (Corrected here after code review caught this during Task 2's execution.)

- [ ] **Step 3: Verify**

```bash
grep -n "uses-permission\|uses-feature" android/app/src/main/AndroidManifest.xml
```

Expected: shows all three new lines.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "android: add camera and internet permissions"
```

---

### Task 3: Generate app icon and splash screen assets

**Files:**
- Modify: `package.json`
- Create: `android/app/src/main/res/**` (generated icon/splash resources)

- [ ] **Step 1: Install the asset generator**

```bash
npm install -D @capacitor/assets@latest
```

- [ ] **Step 2: Stage a source icon**

`@capacitor/assets` expects source files under `assets/`. Create the directory and copy the existing logo:

```bash
mkdir -p assets
cp public/logo.png assets/icon.png
cp public/logo.png assets/splash.png
```

- [ ] **Step 3: Generate Android icon and splash resources**

```bash
npx capacitor-assets generate --android
```

Expected: populates `android/app/src/main/res/mipmap-*/` and splash-related drawables from the source images.

- [ ] **Step 4: Sync and commit**

```bash
npx cap sync android
git add package.json package-lock.json assets/ android/app/src/main/res/
git commit -m "android: generate app icon and splash screen from logo.png"
```

---

### Task 3b: Fix icon/splash defects found in Task 3's review (do this before Task 12)

Task 3's code review found two real, visually-confirmed defects in the generated assets, using the full `logo.png` key-art directly as both the adaptive-icon foreground and the splash source: (1) the adaptive launcher icon has a white halo around it (the generator defaulted the background layer to white since the source has no alpha channel to split), and the dense key-art (character, spray can, wordmark) is illegible at actual launcher-icon sizes; (2) the landscape splash screen center-crops the top of the 1254×1254 square source, cutting "CARDIO" off the "CARDIO SURFER" wordmark. Neither blocked Task 3 from being approved, but both should be fixed before store-listing screenshots/submission (Task 12 onward), not left as-is.

This task isn't broken into TDD steps like the others since it's visual asset work, not testable code — do it as a normal implementation task with a visual self-check (open the generated PNGs) instead of an automated test.

**Files:**
- Modify: `assets/icon.png`, `assets/splash.png` (or replace with better-suited source art)
- Regenerate: `android/app/src/main/res/mipmap-*`, `android/app/src/main/res/drawable*`

- [ ] **Step 1: Fix the icon background halo** — the mechanical part of this fix (swap the plain white adaptive-icon background for one of the app's own brand colors, e.g. the dark background `#080711` used throughout `src/App.css`) can be done without new art: after regenerating, directly edit the generated `android/app/src/main/res/mipmap-*/ic_launcher_background.png` files (or, better, use `@capacitor/assets`' background-color option if the installed version supports one — check `npx capacitor-assets generate --help`) to use `#080711` instead of white.
- [ ] **Step 2: Address wordmark legibility and the landscape splash crop** — this needs an actual design decision, not a mechanical fix: either a simplified icon mark (e.g. just the character/mascot, without the wordmark, designed to read at ~48dp) and a wordmark-centered or portrait-safe splash crop, or accepting the current art with the background-color fix from Step 1 as good enough for an initial internal-testing release. **Ask the user which they want** before spending more time on custom asset creation — this is a product/design call, not something to decide unilaterally.
- [ ] **Step 3: Regenerate and verify**

```bash
npx capacitor-assets generate --android
npx cap sync android
```

Open a few of the generated `mipmap-xxxhdpi/ic_launcher*.png` and `drawable-land-xxxhdpi/splash.png` files directly to visually confirm the halo and crop issues are actually resolved before committing — don't just trust that re-running the generator fixed it.

- [ ] **Step 4: Commit**

```bash
git add assets/ android/app/src/main/res/
git commit -m "android: fix icon background halo and landscape splash crop"
```

---

### Task 4: Generate the upload keystore and wire release signing

**Files:**
- Create: `android/keystore.properties.example`
- Modify: `android/app/build.gradle`
- Modify: `.gitignore`

- [ ] **Step 1: Generate a fresh random keystore password**

```bash
cd android
STORE_PASS=$(openssl rand -base64 24)
echo "SAVE THIS PASSWORD SOMEWHERE SAFE (password manager) — it will not be shown again after this step: $STORE_PASS"
```

- [ ] **Step 2: Generate the upload keystore**

```bash
keytool -genkeypair -v \
  -keystore cardio-surfer-upload.jks \
  -alias cardio-surfer-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS \
  -storepass "$STORE_PASS" \
  -keypass "$STORE_PASS" \
  -dname "CN=Cardio Surfer, OU=Dev, O=Cardio Surfer, L=Unknown, ST=Unknown, C=IN"
```

Expected: creates `android/cardio-surfer-upload.jks`. **This file and `$STORE_PASS` must be backed up outside the repo immediately** (password manager or encrypted drive) — this is the upload key referenced in the design spec; losing it is recoverable via Play Console's reset process but still worth avoiding.

- [ ] **Step 3: Add gitignore entries**

Add to `.gitignore` (repo root):

```
# Android signing — never commit
android/*.jks
android/*.keystore
android/keystore.properties
android/app/google-services.json
```

- [ ] **Step 4: Create the committed template**

`android/keystore.properties.example`:

```properties
# Copy to android/keystore.properties for local builds (gitignored, never commit real values).
# CI reads the equivalent values from GitHub Actions secrets instead — see
# .github/workflows/android-build.yml.
storeFile=cardio-surfer-upload.jks
storePassword=
keyAlias=cardio-surfer-upload
keyPassword=
```

- [ ] **Step 5: Wire the release signing config in `android/app/build.gradle`**

Add near the top of the file, before the `android {` block:

```groovy
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Inside the `android { }` block, add a `signingConfigs` block and reference it from the `release` build type:

```groovy
    signingConfigs {
        release {
            storeFile keystorePropertiesFile.exists() ? file(keystoreProperties['storeFile']) : null
            storePassword keystorePropertiesFile.exists() ? keystoreProperties['storePassword'] : System.getenv("KEYSTORE_PASSWORD")
            keyAlias keystorePropertiesFile.exists() ? keystoreProperties['keyAlias'] : System.getenv("KEY_ALIAS")
            keyPassword keystorePropertiesFile.exists() ? keystoreProperties['keyPassword'] : System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
```

This lets local builds (if ever needed) read from `keystore.properties`, while CI supplies the same four values as environment variables — see Task 8.

- [ ] **Step 6: Commit**

```bash
cd ..
git add .gitignore android/keystore.properties.example android/app/build.gradle
git commit -m "android: wire release signing config, gitignore keystore files"
```

Note: `android/cardio-surfer-upload.jks` and `keystore.properties` are intentionally NOT committed — verify with `git status` that they don't appear before moving on.

---

### Task 5: Extract SHA-1/SHA-256 fingerprints for both keystores

**Files:** none (output feeds directly into Task 6, no commit)

- [ ] **Step 1: Get the debug keystore's fingerprints**

Capacitor's Android build auto-generates a debug keystore on first build. If it doesn't exist yet, generate it first:

```bash
ls ~/.android/debug.keystore 2>/dev/null || keytool -genkeypair -v \
  -keystore ~/.android/debug.keystore -alias androiddebugkey \
  -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"

keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep -E "SHA1:|SHA256:"
```

Expected: prints one `SHA1:` and one `SHA256:` line. Save both.

- [ ] **Step 2: Get the release (upload) keystore's fingerprints**

```bash
keytool -list -v -keystore android/cardio-surfer-upload.jks -alias cardio-surfer-upload -storepass "$STORE_PASS" | grep -E "SHA1:|SHA256:"
```

Expected: prints another `SHA1:`/`SHA256:` pair, different from the debug ones. Save both — all four values (debug SHA-1, debug SHA-256, release SHA-1, release SHA-256) are needed in Task 6.

---

### Task 6: Register the Android app in Firebase and save `google-services.json`

**Files:**
- Create: `android/app/google-services.json` (gitignored, not committed)

This task needs direct action in the Firebase console with the user's Google account — walk the user through it directly, the same way earlier Firebase/Cloudflare setup steps in this project required direct user action.

- [ ] **Step 1: Register the Android app**

In the Firebase console: `cardio-surfer` project → Project Settings → Your apps → Add app → Android. Enter package name `com.cardiosurfer.app`. Register the app.

- [ ] **Step 2: Add both SHA fingerprints**

Still on that Android app's settings page, add SHA certificate fingerprints — paste in all four values saved from Task 5 (debug SHA-1, debug SHA-256, release SHA-1, release SHA-256).

- [ ] **Step 3: Download `google-services.json`**

Download the file Firebase generates and save it as `android/app/google-services.json` in the project.

- [ ] **Step 4: Verify it's gitignored, not commit it**

```bash
git status --short android/app/google-services.json
```

Expected: no output (already covered by the `.gitignore` entry from Task 4) — confirming it won't get committed.

- [ ] **Step 5: Base64-encode it for the CI secret used in Task 8**

```bash
base64 -w0 android/app/google-services.json > /tmp/google-services-b64.txt
cat /tmp/google-services-b64.txt
```

Save this output — it's pasted into a GitHub secret in Task 8.

---

### Task 7: Add native Google Sign-In and branch `useAuth.ts`

**Files:**
- Modify: `package.json`
- Modify: `android/build.gradle`
- Modify: `android/app/build.gradle`
- Modify: `src/firebase/useAuth.ts`

- [ ] **Step 1: Install the plugin**

```bash
npm install @capacitor-firebase/authentication@latest
```

Before proceeding, check the installed version's README/CHANGELOG for its stated Firebase JS SDK and Capacitor compatibility range, and confirm it matches this project's `firebase` (`^11.0.2`, see `package.json`) and `@capacitor/core` versions from Task 1. If it doesn't, note the mismatch and pick the closest compatible version instead of proceeding blind.

- [ ] **Step 2: Add the Google Services Gradle plugin**

In `android/build.gradle`, inside the top-level `buildscript { dependencies { ... } }` block, add:

```groovy
        classpath 'com.google.gms:google-services:4.4.2'
```

In `android/app/build.gradle`, at the very bottom of the file, add:

```groovy
apply plugin: 'com.google.gms.google-services'
```

- [ ] **Step 3: Sync**

```bash
npx cap sync android
```

- [ ] **Step 4: Branch `useAuth.ts`'s `signIn()` on native platform**

Replace `src/firebase/useAuth.ts` with:

```typescript
import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth } from './config';

export interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<User>;
  signOut: () => Promise<void>;
}

async function signInNative(): Promise<User> {
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Native Google Sign-In did not return an ID token');
  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
}

async function signInWeb(): Promise<User> {
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (): Promise<User> => {
    return Capacitor.isNativePlatform() ? signInNative() : signInWeb();
  };

  const signOut = async (): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut();
    }
    await firebaseSignOut(auth);
  };

  return { user, loading, signIn, signOut };
}
```

- [ ] **Step 5: Run the existing test suite to confirm the web path is unchanged**

```bash
npx vitest run src/firebase/useAuth.test.ts
```

Expected: PASS, same 4/4 cases as before — `Capacitor.isNativePlatform()` returns `false` under jsdom/Vitest, so `signIn()`/`signOut()` take the unchanged `signInWeb()`/plain-`firebaseSignOut()` path the existing tests already cover. The native path itself isn't unit-testable (no real native runtime in Vitest) and is verified by the real-device test in Task 9 instead.

- [ ] **Step 6: Typecheck**

```bash
npx tsc -b
```

Expected: passes with no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json android/build.gradle android/app/build.gradle src/firebase/useAuth.ts
git commit -m "android: add native Google Sign-In, branch useAuth for native vs web"
```

---

### Task 8: Add the GitHub Actions build workflow

**Files:**
- Create: `.github/workflows/android-build.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/android-build.yml`:

```yaml
name: Android Build

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Install dependencies
        run: npm ci

      - name: Decode google-services.json
        run: echo "${{ secrets.GOOGLE_SERVICES_JSON_BASE64 }}" | base64 -d > android/app/google-services.json

      - name: Decode signing keystore
        run: echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > android/cardio-surfer-upload.jks

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Build signed AAB
        working-directory: android
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew bundleRelease

      - uses: actions/upload-artifact@v4
        with:
          name: cardio-surfer-release-aab
          path: android/app/build/outputs/bundle/release/app-release.aab
```

This is triggered manually (`workflow_dispatch`), not on every push — a new native build is only needed when the native shell itself changes (icon, permissions, plugin), not for ordinary web/gameplay fixes, which the remote-URL architecture already ships instantly without a rebuild.

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/android-build.yml
git commit -m "ci: add manual GitHub Actions workflow to build signed Android AAB"
git push origin frontend-auth-leaderboard
```

---

### Task 9: Configure GitHub secrets, build, and run the Validation Spike

This task needs direct user action (GitHub's web UI, Play Console, a real Android device) — walk the user through it directly. **This is the hard gate from the design spec: do not proceed to Task 10 or beyond until every step below passes.**

**Files:** none (verification only, no commit).

- [ ] **Step 1: Base64-encode the keystore**

```bash
base64 -w0 android/cardio-surfer-upload.jks > /tmp/keystore-b64.txt
```

- [ ] **Step 2: Add repository secrets**

In the GitHub repo (`Devth97/CARDIO-SURFER`) → Settings → Secrets and variables → Actions → New repository secret. Add each of these five:

| Secret name | Value |
|---|---|
| `GOOGLE_SERVICES_JSON_BASE64` | contents of `/tmp/google-services-b64.txt` from Task 6 |
| `KEYSTORE_BASE64` | contents of `/tmp/keystore-b64.txt` from Step 1 above |
| `KEYSTORE_PASSWORD` | the `$STORE_PASS` value from Task 4 |
| `KEY_ALIAS` | `cardio-surfer-upload` |
| `KEY_PASSWORD` | the `$STORE_PASS` value from Task 4 (same value — the keystore was generated with `-storepass` and `-keypass` set equal) |

- [ ] **Step 3: Run the workflow**

GitHub repo → Actions tab → "Android Build" workflow → "Run workflow" button (on the `frontend-auth-leaderboard` branch). Wait for it to complete, then download the `cardio-surfer-release-aab` artifact.

- [ ] **Step 4: Install the signed build via Play Console Internal Testing**

In Play Console: create the app if not already created (App name "Cardio Surfer", package `com.cardiosurfer.app`, default language English, category set later in Task 12) → Testing → Internal testing → Create a release → upload the downloaded `.aab` → add the user's own Google account email as a tester → save and publish the internal test → open the provided opt-in link on the real Android device → install "Cardio Surfer" from the Play Store.

- [ ] **Step 5: Run the full manual test on the real device**

Walk through, in order, and stop immediately if any step fails:

1. Open the installed app — the WebView loads the live production site.
2. Tap PLAY while signed out — shows the sign-in screen.
3. Tap "Sign in with Google" — uses the **native** Google account picker (not an embedded web form), completes without a `disallowed_useragent` error, and returns to the app signed in.
4. Camera permission prompt appears and, once granted, calibration starts.
5. Play a full run to completion (or use the keyboard/touch fallback) — reaches Game Over with Score and Calories shown immediately, and "Weekly Rank" resolving to a real number within a couple seconds.
6. Tap "View Leaderboard" — the just-played run appears.
7. Close the app fully (swipe away from recent apps) and reopen it — still shows as signed in, with the player badge visible on the Start screen.
8. Turn off WiFi/mobile data briefly mid-session, then restore it — the app recovers with a sensible error state rather than a blank screen.

If any step fails, treat it as a blocking bug and fix it before proceeding — do not defer to later tasks, per the design spec's Validation Spike gate.

---

### Task 10: Add the privacy policy page

**Files:**
- Create: `public/privacy.html`

- [ ] **Step 1: Write the privacy page**

`public/privacy.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privacy Policy — Cardio Surfer</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #111; }
      h1 { font-size: 1.5rem; }
      h2 { font-size: 1.1rem; margin-top: 2rem; }
    </style>
  </head>
  <body>
    <h1>Privacy Policy — Cardio Surfer</h1>
    <p>Last updated: 2026-08-17</p>

    <h2>Account information</h2>
    <p>Cardio Surfer uses Google Sign-In (via Firebase Authentication) to identify players. When you sign in, we receive your Google account's name, email address, and profile photo, and store a unique account identifier tied to them.</p>

    <h2>Gameplay data</h2>
    <p>When you complete a run, your score, calories burned, and run duration are sent to our backend and stored against your account, so they can appear on the weekly and all-time leaderboards. Your display name and score (not your email address) are visible to other players on the leaderboard.</p>

    <h2>Camera access</h2>
    <p>Cardio Surfer requires camera access to play. Camera video is processed live, entirely on your device, to detect your body movement for gameplay (jumping, ducking, moving between lanes). This video is never uploaded, transmitted, or stored anywhere — it exists only transiently on your device while you play, the same way any local video call preview would.</p>

    <h2>Third-party services</h2>
    <p>We use Firebase Authentication (Google) to manage sign-in, and Cloudflare Workers and D1 to host our backend and store gameplay/leaderboard data.</p>

    <h2>Analytics and crash reporting</h2>
    <p>Cardio Surfer does not currently use any analytics or crash-reporting service.</p>

    <h2>Data retention and deletion</h2>
    <p>Your account and gameplay data are retained for as long as your account exists. To request deletion of your data, contact us using the details below.</p>

    <h2>Contact</h2>
    <p>For privacy questions or data deletion requests, contact the developer via the app's Google Play Store listing page.</p>
  </body>
</html>
```

- [ ] **Step 2: Verify locally**

```bash
npm run build
ls dist/privacy.html
```

Expected: file exists in the build output (Vite copies everything under `public/` as-is).

- [ ] **Step 3: Commit**

```bash
git add public/privacy.html
git commit -m "frontend: add privacy policy page"
```

---

### Task 11: Deploy the privacy page and verify it's live

**Files:** none (deploy only, no commit).

- [ ] **Step 1: Deploy**

```bash
npm run deploy
```

- [ ] **Step 2: Verify**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://subway-fit-frontend.subway-fit-worker.workers.dev/privacy.html
```

Expected: `200`.

---

### Task 12: Draft the Play Store listing content

**Files:**
- Create: `docs/store-listing.md`

- [ ] **Step 1: Write the listing copy**

`docs/store-listing.md`:

```markdown
# Cardio Surfer — Play Store Listing

**App name:** Cardio Surfer

**Category:** Health & Fitness

**Short description (max 80 characters):**
Turn your body into the controller — a camera-tracked cardio endless runner.

**Full description:**
Cardio Surfer turns your workout into a game. Using your phone or laptop's camera, it tracks your body movement in real time — no wearables, no controller, just you.

Raise your right or left hand to switch lanes, jump in place to clear hurdles, and squat down to duck under obstacles, all while racing down an endless 3-lane track. Every move you make is a move your character makes.

- **Real cardio, real fitness:** every jump, duck, and lane change burns calories, tracked and shown after every run.
- **Compete on the leaderboard:** weekly and all-time rankings show how you stack up.
- **Google Sign-In:** your scores and stats are saved to your account.
- **Camera privacy first:** your camera video is processed entirely on your device and is never uploaded or stored anywhere — only your gameplay stats (score, calories) are saved.

Camera access is required to play — Cardio Surfer uses it to detect your movement during gameplay, on-device only.

**Privacy policy URL:** https://subway-fit-frontend.subway-fit-worker.workers.dev/privacy.html
```

- [ ] **Step 2: Commit**

```bash
git add docs/store-listing.md
git commit -m "docs: draft Play Store listing copy"
```

---

### Task 13: Capture non-gameplay screenshots

**Files:** none (produces image files for manual upload in Task 14, no commit).

- [ ] **Step 1: Capture the Start, Leaderboard, and Game Over screens**

Using the gstack `/browse` headless browser against the live production URL:

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto https://subway-fit-frontend.subway-fit-worker.workers.dev
$B viewport 1080x1920
$B screenshot /tmp/screenshot-start.png
$B click "text=Leaderboard" 2>/dev/null || true
$B screenshot /tmp/screenshot-leaderboard.png
```

- [ ] **Step 2: Get real gameplay screenshots from the user**

Ask the user for 2-3 screenshots from an actual play session (mid-run, a power-up, Game Over) — these can't be captured headlessly since there's no real camera in this environment. This is a direct ask to the user, not an automatable step.

---

### Task 14: Create the Play Console listing

This task needs direct user action in Play Console — walk the user through it directly.

**Files:** none (external configuration, no commit).

- [ ] **Step 1: Fill in store listing content**

Play Console → the app created in Task 9 → Grow → Store presence → Main store listing. Paste in the title, short description, and full description from `docs/store-listing.md`. Set category to Health & Fitness. Upload the 512×512 icon (from `android/app/src/main/res/mipmap-xxxhdpi/` generated in Task 3, or re-export at 512×512 from `public/logo.png`) and the screenshots from Task 13. Set the privacy policy URL to `https://subway-fit-frontend.subway-fit-worker.workers.dev/privacy.html`.

- [ ] **Step 2: Content rating questionnaire**

Play Console → Policy → App content → Content ratings. Answer the questionnaire — Cardio Surfer has no violence, gambling references, user-generated content, or in-app purchases at this stage, so this should resolve to a low/all-ages rating. Claude can review the specific questions with the user if any are ambiguous, but the user must submit it themselves.

- [ ] **Step 3: Data Safety form**

Play Console → Policy → App content → Data safety. Declare, based on what the app actually does (not copied from the privacy policy prose):
- Collects: name, email address, photo (account info, for authentication) — shared with no one, not encrypted-in-transit-optional (Firebase uses HTTPS, so mark as encrypted in transit)
- Collects: app activity (gameplay score/calories/duration) — used for account functionality (leaderboard), not shared with third parties, encrypted in transit
- Camera permission: declare as a permission requested, but **not** as data collected/transmitted, since video is processed on-device and never leaves it
- Data deletion: mark as supported, pointing to the privacy policy's contact section

- [ ] **Step 4: Target audience and content**

Play Console → Policy → App content → Target audience. Select an appropriate age range reflecting a general-audience fitness game (not specifically directed at children).

---

### Task 15: Final go/no-go for public submission

**Files:** none.

- [ ] **Step 1: Confirm with the user**

Everything up to this point produces a fully prepared, installable, internally-tested app and a drafted (but not yet submitted) Play Store listing. Explicitly ask the user whether they want to submit the listing for Google's review now, or hold off further — this is the manual gate from the design spec's non-goal, and should not be done automatically.

- [ ] **Step 2: If approved, submit**

Play Console → the production track → Review release → Start rollout to Production. This is a user-initiated action in the Play Console UI, not something to script.

---

## Plan self-review notes

- **Spec coverage:** Capacitor remote-URL architecture (Task 1), navigation allowlist (Task 1 Step 2), camera/internet permissions with `required="true"` as an explicit choice (Task 2), icon/splash generation (Task 3), upload keystore + Play App Signing framing (Task 4), SHA fingerprint requirement for both debug and release (Task 5), Firebase Android app registration (Task 6), native Google Sign-In mitigation with the `useAuth.ts` branch (Task 7), GitHub Actions manual build (Task 8), the full Validation Spike gate including network-resilience checks (Task 9), privacy policy content checklist (Task 10), store listing copy with the camera disclosure (Task 12), content rating questionnaire and Data Safety form as distinct requirements (Task 14), and the explicit submission gate (Task 15).
- **Not covered here, by design:** payment integration, the paid weekly contest, and iOS packaging — all explicitly out of scope per the design spec.
- **Type consistency:** `AuthState`'s `signIn`/`signOut` signatures in Task 7 are unchanged from the existing `useAuth.ts` (`() => Promise<User>` / `() => Promise<void>`), so no consumer of `useAuth()` elsewhere in the codebase needs updating.
