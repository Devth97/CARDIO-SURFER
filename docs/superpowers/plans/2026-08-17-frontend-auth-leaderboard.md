# Frontend Auth & Leaderboard Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Vite/React/Three.js "Cardio Surfer" frontend to the already-deployed Phase 1 backend — Google Sign-In gating play, run submission with a silent-fail weekly-rank lookup, a browsable weekly/all-time leaderboard, and an AdMob banner placeholder slot — then deploy the frontend to Cloudflare Pages.

**Architecture:** A `useAuth()` hook wraps Firebase Auth and is owned by `App.tsx`; a thin `api/client.ts` module wraps the four worker endpoints. Everything else (screens) stays presentational — auth state and API results flow down as props, exactly matching the existing `App.tsx`-as-controller pattern already used for `engine`/`poseTracker`/`screen` state. Two new screens (`SignInScreen`, `LeaderboardScreen`) and two modified ones (`StartScreen`, `GameOverScreen`) cover the UI; no changes to the game engine, pose tracking, or rendering.

**Tech Stack:** Firebase Auth SDK (`firebase`), the existing Vite/React stack, Vitest + `@testing-library/react` + `jsdom` for testing (new to this project), Wrangler for the Cloudflare Pages deploy.

---

## File structure

```
vitest.config.ts        — new, frontend test harness config
.env.example             — new, documents required VITE_* env vars
src/
  vite-env.d.ts           — new, types import.meta.env.VITE_*
  test/
    setup.ts              — new, RTL jest-dom matchers
    sanity.test.ts         — new, harness smoke test
  firebase/
    config.ts              — new, Firebase app + auth instance
    useAuth.ts               — new, onAuthStateChanged wrapper hook
    useAuth.test.ts
  api/
    types.ts                 — new, request/response types matching the worker
    client.ts                  — new, syncUser/submitRun/getLeaderboard/getMyHistory
    client.test.ts
  components/
    AdBanner.tsx                — new, ad slot (placeholder until AdMob account exists)
    AdBanner.test.tsx
    SignInScreen.tsx              — new, full-screen Google Sign-In prompt
    SignInScreen.test.tsx
    LeaderboardScreen.tsx           — new, weekly/all-time ranked list
    LeaderboardScreen.test.tsx
    StartScreen.tsx                  — modified: LEADERBOARD button, player badge/sign-out
    StartScreen.test.tsx               — new
    GameOverScreen.tsx                   — modified: weekly-rank badge, view-leaderboard link
    GameOverScreen.test.tsx                — new
  App.tsx                                   — modified: screen state machine, sign-in flow, submission
  App.css                                     — modified: styles for all of the above
worker/wrangler.toml                           — modified (Task 12 only): ALLOWED_ORIGIN
```

---

### Task 1: Add frontend test tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/sanity.test.ts`

The frontend currently has zero test infrastructure. This task adds Vitest + React Testing Library + jsdom, mirroring how the worker project got its own test harness, so every later task can write and run real tests.

- [ ] **Step 1: Add test dependencies and a `test` script to `package.json`**

Replace `package.json` with:

```json
{
  "name": "subway-fit",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "^1.0.1",
    "@types/canvas-confetti": "^1.9.0",
    "@types/three": "^0.185.4",
    "canvas-confetti": "^1.9.4",
    "framer-motion": "^13.1.0",
    "lucide-react": "^1.31.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "three": "^0.185.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.4",
    "jsdom": "^25.0.1",
    "oxlint": "^1.75.0",
    "typescript": "~6.0.2",
    "vite": "^8.2.0",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: succeeds, `node_modules` updated. If any single version fails to resolve in this environment (as happened with a couple of packages in the backend plan), install the latest available compatible version for that package instead and note the substitution.

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
);
```

- [ ] **Step 4: Create `src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Create `src/test/sanity.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test suite**

```bash
npm test
```

Expected: 1 test file, 1 test, passed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/setup.ts src/test/sanity.test.ts
git commit -m "frontend: add Vitest + React Testing Library test harness"
```

---

### Task 2: Add Firebase SDK and config

**Files:**
- Modify: `package.json`
- Create: `src/vite-env.d.ts`
- Create: `src/firebase/config.ts`
- Create: `.env.example`

- [ ] **Step 1: Add the `firebase` dependency**

In `package.json`, add `"firebase": "^11.0.2"` to `dependencies` (alphabetical order, between `canvas-confetti` and `framer-motion`):

```json
  "dependencies": {
    "@mediapipe/tasks-vision": "^1.0.1",
    "@types/canvas-confetti": "^1.9.0",
    "@types/three": "^0.185.4",
    "canvas-confetti": "^1.9.4",
    "firebase": "^11.0.2",
    "framer-motion": "^13.1.0",
    "lucide-react": "^1.31.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "three": "^0.185.1"
  },
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: `firebase` added to `node_modules`.

- [ ] **Step 3: Type the required `VITE_*` env vars**

Create `src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_ADMOB_BANNER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Document the required env vars**

Create `.env.example`:

```
# Copy this file to .env.local and fill in real values.
# .env.local is gitignored (see root .gitignore's ".env" / ".env.*" entries) — never commit real keys here.

# The deployed Cloudflare Worker API from the backend plan.
VITE_API_URL=https://subway-fit-api.subway-fit-worker.workers.dev

# From Firebase Console -> Project Settings -> your apps -> Web app config.
# These are NOT secrets (Firebase's own docs confirm they're meant to be public/embedded
# in client bundles) -- they identify the project, they don't grant access on their own.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=cardio-surfer
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Leave unset until a real AdMob account + ad unit exists -- AdBanner
# renders an empty placeholder slot when this is unset.
VITE_ADMOB_BANNER_ID=
```

- [ ] **Step 5: Create the Firebase app/auth instance**

Create `src/firebase/config.ts`:

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc -b
```

Expected: passes with no errors. (`.env.local` doesn't need to exist yet for this to pass — `import.meta.env.VITE_*` typing is structural, not dependent on runtime values.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/vite-env.d.ts src/firebase/config.ts .env.example
git commit -m "frontend: add Firebase SDK and app config"
```

---

### Task 3: `useAuth()` hook

**Files:**
- Create: `src/firebase/useAuth.ts`
- Test: `src/firebase/useAuth.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/firebase/useAuth.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { useAuth } from './useAuth';

const { onAuthStateChangedMock, signInWithPopupMock, signOutMock } = vi.hoisted(() => ({
  onAuthStateChangedMock: vi.fn(),
  signInWithPopupMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: onAuthStateChangedMock,
  signInWithPopup: signInWithPopupMock,
  signOut: signOutMock,
}));

vi.mock('./config', () => ({ auth: {} }));

describe('useAuth', () => {
  beforeEach(() => {
    onAuthStateChangedMock.mockReset();
    signInWithPopupMock.mockReset();
    signOutMock.mockReset();
  });

  it('starts loading and reflects a signed-out user once Firebase reports null', async () => {
    let capturedCallback: (user: User | null) => void = () => {};
    onAuthStateChangedMock.mockImplementation((_auth: unknown, callback: (u: User | null) => void) => {
      capturedCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);

    act(() => {
      capturedCallback(null);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('reflects a signed-in user once Firebase reports one', async () => {
    const fakeUser = { uid: 'user-1', displayName: 'Ada' } as User;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, callback: (u: User | null) => void) => {
      callback(fakeUser);
      return () => {};
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(fakeUser);
  });

  it('signIn calls Firebase signInWithPopup and returns the signed-in user', async () => {
    onAuthStateChangedMock.mockImplementation(() => () => {});
    const fakeUser = { uid: 'user-1' } as User;
    signInWithPopupMock.mockResolvedValue({ user: fakeUser });

    const { result } = renderHook(() => useAuth());

    let returnedUser: User | undefined;
    await act(async () => {
      returnedUser = await result.current.signIn();
    });

    expect(signInWithPopupMock).toHaveBeenCalledTimes(1);
    expect(returnedUser).toEqual(fakeUser);
  });

  it('signOut calls Firebase signOut', async () => {
    onAuthStateChangedMock.mockImplementation(() => () => {});
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signOut();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/firebase/useAuth.test.ts
```

Expected: FAIL — `Cannot find module './useAuth'`.

- [ ] **Step 3: Implement `useAuth.ts`**

`src/firebase/useAuth.ts`:

```typescript
import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth } from './config';

export interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<User>;
  signOut: () => Promise<void>;
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
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    return result.user;
  };

  const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth);
  };

  return { user, loading, signIn, signOut };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/firebase/useAuth.test.ts
```

Expected: PASS, 4/4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/firebase/useAuth.ts src/firebase/useAuth.test.ts
git commit -m "frontend: add useAuth hook wrapping Firebase Auth"
```

---

### Task 4: API client

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/client.ts`
- Test: `src/api/client.test.ts`

Types here mirror the worker's own response shapes exactly (`worker/src/types.ts`, `worker/src/routes.ts`) — kept as a separate copy since the frontend and worker are independent projects with no shared package.

- [ ] **Step 1: Define the shared types**

`src/api/types.ts`:

```typescript
export interface RunSubmission {
  score: number;
  calories: number;
  durationSec: number;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
}

export interface LeaderboardResponse {
  scope: 'weekly' | 'alltime';
  entries: LeaderboardEntry[];
}

export interface HistoryEntry {
  id: number;
  score: number;
  calories: number;
  durationSec: number;
  createdAt: string;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
}

export type SubmitRunResult = { ok: true } | { ok: false; error: string };
```

- [ ] **Step 2: Write the failing tests**

`src/api/client.test.ts`:

```typescript
// @vitest-environment node
//
// Runs under Node's environment (not jsdom) because this file exercises real
// Web Fetch API globals (`fetch`, `Response`) that jsdom doesn't implement —
// Node 18+ provides them natively, and this file renders no DOM so jsdom
// brings no benefit here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { getLeaderboard, getMyHistory, submitRun, syncUser } from './client';

const fakeUser = {
  getIdToken: vi.fn().mockResolvedValue('fake-id-token'),
} as unknown as User;

describe('API client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.test.example');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('syncUser POSTs to /users/sync with a Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await syncUser(fakeUser);

    expect(fetch).toHaveBeenCalledWith('https://api.test.example/users/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer fake-id-token' },
    });
  });

  it('submitRun POSTs the submission body with a Bearer token and returns the parsed result', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await submitRun(fakeUser, { score: 500, calories: 30, durationSec: 60 });

    expect(fetch).toHaveBeenCalledWith('https://api.test.example/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({ score: 500, calories: 30, durationSec: 60 }),
    });
    expect(result).toEqual({ ok: true });
  });

  it('getLeaderboard GETs without an Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ scope: 'weekly', entries: [] }), { status: 200 }),
    );

    const result = await getLeaderboard('weekly', 10);

    expect(fetch).toHaveBeenCalledWith('https://api.test.example/leaderboard?scope=weekly&limit=10');
    expect(result).toEqual({ scope: 'weekly', entries: [] });
  });

  it('getMyHistory GETs with a Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ entries: [] }), { status: 200 }));

    await getMyHistory(fakeUser, 5);

    expect(fetch).toHaveBeenCalledWith('https://api.test.example/me/history?limit=5', {
      headers: { Authorization: 'Bearer fake-id-token' },
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/api/client.test.ts
```

Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 4: Implement `client.ts`**

`src/api/client.ts`:

```typescript
import type { User } from 'firebase/auth';
import type {
  HistoryResponse,
  LeaderboardResponse,
  RunSubmission,
  SubmitRunResult,
} from './types';

// Read lazily (not at module scope) so tests can override it per-test via
// vi.stubEnv before each call, instead of depending on Vite's env-file
// loading order relative to this module's first import.
function apiUrl(): string {
  return import.meta.env.VITE_API_URL;
}

async function authHeader(user: User | null): Promise<Record<string, string>> {
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function syncUser(user: User): Promise<void> {
  await fetch(`${apiUrl()}/users/sync`, {
    method: 'POST',
    headers: await authHeader(user),
  });
}

export async function submitRun(user: User, submission: RunSubmission): Promise<SubmitRunResult> {
  const response = await fetch(`${apiUrl()}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader(user)) },
    body: JSON.stringify(submission),
  });
  return response.json() as Promise<SubmitRunResult>;
}

export async function getLeaderboard(
  scope: 'weekly' | 'alltime',
  limit = 50,
): Promise<LeaderboardResponse> {
  const response = await fetch(`${apiUrl()}/leaderboard?scope=${scope}&limit=${limit}`);
  return response.json() as Promise<LeaderboardResponse>;
}

export async function getMyHistory(user: User, limit = 50): Promise<HistoryResponse> {
  const response = await fetch(`${apiUrl()}/me/history?limit=${limit}`, {
    headers: await authHeader(user),
  });
  return response.json() as Promise<HistoryResponse>;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/api/client.test.ts
```

Expected: PASS, 4/4 cases.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/api/client.test.ts
git commit -m "frontend: add API client for worker endpoints"
```

---

### Task 5: `AdBanner` component

**Files:**
- Create: `src/components/AdBanner.tsx`
- Test: `src/components/AdBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/AdBanner.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import AdBanner from './AdBanner';

describe('AdBanner', () => {
  it('renders an empty placeholder slot when no ad unit ID is configured', () => {
    // VITE_ADMOB_BANNER_ID is intentionally left unset in the test env,
    // matching the real state until an AdMob account exists (see the design
    // doc's manual-setup section) -- this is the actual default behavior
    // every test run and every deploy will have until that account exists.
    const { container } = render(<AdBanner />);
    const banner = container.querySelector('.ad-banner');
    expect(banner).toHaveClass('ad-banner-placeholder');
    expect(banner).not.toHaveAttribute('data-ad-unit');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/AdBanner.test.tsx
```

Expected: FAIL — `Cannot find module './AdBanner'`.

- [ ] **Step 3: Implement `AdBanner.tsx`**

`src/components/AdBanner.tsx`:

```tsx
// Reserves the ad slot's layout space either way, so turning on real ads
// later (once a real AdMob account + ad unit ID exists) doesn't shift
// surrounding UI.
export default function AdBanner() {
  const adUnitId = import.meta.env.VITE_ADMOB_BANNER_ID;

  if (!adUnitId) {
    return <div className="ad-banner ad-banner-placeholder" aria-hidden="true" />;
  }

  return <div className="ad-banner" data-ad-unit={adUnitId} />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/AdBanner.test.tsx
```

Expected: PASS, 1/1 case.

- [ ] **Step 5: Commit**

```bash
git add src/components/AdBanner.tsx src/components/AdBanner.test.tsx
git commit -m "frontend: add AdBanner placeholder slot component"
```

---

### Task 6: `SignInScreen` component

**Files:**
- Create: `src/components/SignInScreen.tsx`
- Test: `src/components/SignInScreen.test.tsx`

Full-screen takeover, per the approved design (chosen over a modal). Presentational only — `App.tsx` owns the actual Firebase call.

- [ ] **Step 1: Write the failing tests**

`src/components/SignInScreen.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignInScreen from './SignInScreen';

describe('SignInScreen', () => {
  it('calls onSignIn when the sign-in button is clicked', () => {
    const onSignIn = vi.fn();
    render(<SignInScreen onSignIn={onSignIn} onBack={() => {}} error={null} loading={false} />);

    fireEvent.click(screen.getByText(/sign in with google/i));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when provided', () => {
    render(
      <SignInScreen
        onSignIn={() => {}}
        onBack={() => {}}
        error="Could not sign in. Please try again."
        loading={false}
      />,
    );
    expect(screen.getByText(/could not sign in/i)).toBeInTheDocument();
  });

  it('disables the button and shows a loading label while signing in', () => {
    render(<SignInScreen onSignIn={() => {}} onBack={() => {}} error={null} loading={true} />);
    expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  it('calls onBack when the back link is clicked', () => {
    const onBack = vi.fn();
    render(<SignInScreen onSignIn={() => {}} onBack={onBack} error={null} loading={false} />);
    fireEvent.click(screen.getByText(/back/i));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/SignInScreen.test.tsx
```

Expected: FAIL — `Cannot find module './SignInScreen'`.

- [ ] **Step 3: Implement `SignInScreen.tsx`**

`src/components/SignInScreen.tsx`:

```tsx
import { motion } from 'framer-motion';
import { Chrome, Activity } from 'lucide-react';

interface Props {
  onSignIn: () => void;
  onBack: () => void;
  error: string | null;
  loading: boolean;
}

export default function SignInScreen({ onSignIn, onBack, error, loading }: Props) {
  return (
    <motion.div
      className="screen sign-in-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <h1 className="title">CARDIO SURFER</h1>
      <p className="subtitle">Sign in with Google to start playing and track your scores.</p>

      {error && <p className="error">{error}</p>}

      <button className="primary-btn pulse" onClick={onSignIn} disabled={loading}>
        {loading ? (
          <>
            <Activity className="spin" size={18} /> Signing In…
          </>
        ) : (
          <>
            <Chrome size={20} /> Sign in with Google
          </>
        )}
      </button>

      {!loading && (
        <button className="text-link" onClick={onBack}>
          ← Back
        </button>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/SignInScreen.test.tsx
```

Expected: PASS, 4/4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/SignInScreen.tsx src/components/SignInScreen.test.tsx
git commit -m "frontend: add SignInScreen"
```

---

### Task 7: `LeaderboardScreen` component

**Files:**
- Create: `src/components/LeaderboardScreen.tsx`
- Test: `src/components/LeaderboardScreen.test.tsx`

Owns its own data fetching (calls `api/client` directly on mount and on tab switch), per the approved design — this keeps tab-switching self-contained instead of routing every click through `App.tsx`.

- [ ] **Step 1: Write the failing tests**

`src/components/LeaderboardScreen.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { User } from 'firebase/auth';
import LeaderboardScreen from './LeaderboardScreen';
import { getLeaderboard } from '../api/client';

vi.mock('../api/client', () => ({
  getLeaderboard: vi.fn(),
}));

const mockedGetLeaderboard = vi.mocked(getLeaderboard);

describe('LeaderboardScreen', () => {
  beforeEach(() => {
    mockedGetLeaderboard.mockReset();
  });

  it('loads and renders weekly entries by default, highlighting the current user', async () => {
    mockedGetLeaderboard.mockResolvedValue({
      scope: 'weekly',
      entries: [
        { uid: 'uid-1', displayName: 'Ada', avatarUrl: null, score: 900 },
        { uid: 'uid-2', displayName: 'Grace', avatarUrl: null, score: 500 },
      ],
    });
    const currentUser = { uid: 'uid-2' } as User;

    render(<LeaderboardScreen currentUser={currentUser} onBack={() => {}} />);

    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    expect(getLeaderboard).toHaveBeenCalledWith('weekly');
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('switches to all-time scope on tab click', async () => {
    mockedGetLeaderboard.mockResolvedValue({ scope: 'weekly', entries: [] });
    render(<LeaderboardScreen currentUser={null} onBack={() => {}} />);
    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('weekly'));

    mockedGetLeaderboard.mockResolvedValue({ scope: 'alltime', entries: [] });
    fireEvent.click(screen.getByText('ALL-TIME'));

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('alltime'));
  });

  it('shows a retry button on fetch failure and retries on click', async () => {
    mockedGetLeaderboard.mockRejectedValueOnce(new Error('network error'));
    render(<LeaderboardScreen currentUser={null} onBack={() => {}} />);

    await waitFor(() => expect(screen.getByText(/couldn't load leaderboard/i)).toBeInTheDocument());

    mockedGetLeaderboard.mockResolvedValueOnce({ scope: 'weekly', entries: [] });
    fireEvent.click(screen.getByText(/retry/i));

    await waitFor(() => expect(screen.getByText(/no runs yet/i)).toBeInTheDocument());
  });

  it('calls onBack when the back button is clicked', () => {
    mockedGetLeaderboard.mockResolvedValue({ scope: 'weekly', entries: [] });
    const onBack = vi.fn();
    render(<LeaderboardScreen currentUser={null} onBack={onBack} />);

    fireEvent.click(screen.getByTitle('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/LeaderboardScreen.test.tsx
```

Expected: FAIL — `Cannot find module './LeaderboardScreen'`.

- [ ] **Step 3: Implement `LeaderboardScreen.tsx`**

`src/components/LeaderboardScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ArrowLeft, RotateCcw } from 'lucide-react';
import type { User } from 'firebase/auth';
import { getLeaderboard } from '../api/client';
import type { LeaderboardEntry } from '../api/types';
import AdBanner from './AdBanner';

interface Props {
  currentUser: User | null;
  onBack: () => void;
}

type Scope = 'weekly' | 'alltime';

export default function LeaderboardScreen({ currentUser, onBack }: Props) {
  const [scope, setScope] = useState<Scope>('weekly');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback((nextScope: Scope) => {
    setEntries(null);
    setError(false);
    getLeaderboard(nextScope)
      .then((response) => setEntries(response.entries))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load(scope);
  }, [scope, load]);

  return (
    <motion.div
      className="screen leaderboard-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="leaderboard-header">
        <button className="icon-btn" onClick={onBack} title="Back">
          <ArrowLeft size={20} />
        </button>
        <h2 className="title">LEADERBOARD</h2>
      </div>

      <div className="leaderboard-tabs">
        <button
          className={scope === 'weekly' ? 'tab active' : 'tab'}
          onClick={() => setScope('weekly')}
        >
          WEEKLY
        </button>
        <button
          className={scope === 'alltime' ? 'tab active' : 'tab'}
          onClick={() => setScope('alltime')}
        >
          ALL-TIME
        </button>
      </div>

      {error && (
        <div className="leaderboard-error">
          <p>Couldn't load leaderboard.</p>
          <button className="primary-btn" onClick={() => load(scope)}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      )}

      {!error && entries === null && <p className="subtitle">Loading…</p>}

      {!error && entries !== null && (
        <div className="leaderboard-list">
          {entries.length === 0 && <p className="subtitle">No runs yet — be the first!</p>}
          {entries.map((entry, index) => (
            <div
              key={entry.uid}
              className={entry.uid === currentUser?.uid ? 'leaderboard-row you' : 'leaderboard-row'}
            >
              <span className="leaderboard-rank">{index + 1}</span>
              {entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt="" className="leaderboard-avatar" />
              ) : (
                <span className="leaderboard-avatar placeholder" />
              )}
              <span className="leaderboard-name">
                {entry.uid === currentUser?.uid ? 'You' : entry.displayName}
              </span>
              <span className="leaderboard-score">
                <Trophy size={14} /> {entry.score}
              </span>
            </div>
          ))}
        </div>
      )}

      <AdBanner />
    </motion.div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/LeaderboardScreen.test.tsx
```

Expected: PASS, 4/4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/LeaderboardScreen.tsx src/components/LeaderboardScreen.test.tsx
git commit -m "frontend: add LeaderboardScreen"
```

---

### Task 8: Modify `StartScreen`

**Files:**
- Modify: `src/components/StartScreen.tsx`
- Test: `src/components/StartScreen.test.tsx` (new)

Adds a `LEADERBOARD` button (always tappable) and, once signed in, a player badge with a sign-out affordance. `onStart` keeps its existing name/meaning (App.tsx decides whether it needs to gate on sign-in first).

- [ ] **Step 1: Write the failing tests**

`src/components/StartScreen.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StartScreen from './StartScreen';

describe('StartScreen', () => {
  it('calls onStart when PLAY is clicked', () => {
    const onStart = vi.fn();
    render(
      <StartScreen
        onStart={onStart}
        onViewLeaderboard={() => {}}
        onSignOut={() => {}}
        user={null}
        error={null}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByText(/enable camera & play/i));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('calls onViewLeaderboard when the leaderboard button is clicked', () => {
    const onViewLeaderboard = vi.fn();
    render(
      <StartScreen
        onStart={() => {}}
        onViewLeaderboard={onViewLeaderboard}
        onSignOut={() => {}}
        user={null}
        error={null}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByTitle('Leaderboard'));
    expect(onViewLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('does not show a player badge when signed out', () => {
    render(
      <StartScreen
        onStart={() => {}}
        onViewLeaderboard={() => {}}
        onSignOut={() => {}}
        user={null}
        error={null}
        loading={false}
      />,
    );

    expect(screen.queryByTitle('Sign out')).not.toBeInTheDocument();
  });

  it('shows the player badge and calls onSignOut when signed in', () => {
    const onSignOut = vi.fn();
    render(
      <StartScreen
        onStart={() => {}}
        onViewLeaderboard={() => {}}
        onSignOut={onSignOut}
        user={{ displayName: 'Ada', photoURL: null }}
        error={null}
        loading={false}
      />,
    );

    expect(screen.getByText('Ada')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Sign out'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/StartScreen.test.tsx
```

Expected: FAIL — the current `StartScreen` doesn't accept `onViewLeaderboard`/`onSignOut`/`user` props, so `onViewLeaderboard`/leaderboard button assertions fail (TypeScript will also flag the extra props once you look at type errors, but the test itself fails at the missing-element assertions).

- [ ] **Step 3: Replace `StartScreen.tsx`**

`src/components/StartScreen.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Volume2,
  VolumeX,
  ArrowUp,
  ArrowDown,
  Camera,
  Activity,
  HelpCircle,
  Hand,
  LogOut,
} from 'lucide-react';
import { soundManager } from '../game/SoundManager';
import TutorialGuideModal from './TutorialGuideModal';
import AdBanner from './AdBanner';

interface StartScreenUser {
  displayName: string | null;
  photoURL: string | null;
}

interface Props {
  onStart: () => void;
  onViewLeaderboard: () => void;
  onSignOut: () => void;
  user: StartScreenUser | null;
  error: string | null;
  loading: boolean;
}

export default function StartScreen({
  onStart,
  onViewLeaderboard,
  onSignOut,
  user,
  error,
  loading,
}: Props) {
  const [muted, setMuted] = useState(soundManager.isMuted());
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('cardio_surfer_tutorial_seen');
    if (!seen) {
      setShowTutorial(true);
    }
  }, []);

  const handleCloseTutorial = () => {
    localStorage.setItem('cardio_surfer_tutorial_seen', 'true');
    setShowTutorial(false);
  };

  const toggleSound = () => {
    const isMutedNow = soundManager.toggleMute();
    setMuted(isMutedNow);
  };

  const highScore = parseInt(localStorage.getItem('cardio_surfer_high_score') || '0', 10);

  return (
    <motion.div
      className="screen start-screen"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4 }}
    >
      {user && (
        <div className="player-badge">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="player-badge-avatar" />
          ) : (
            <span className="player-badge-avatar placeholder" />
          )}
          <span className="player-badge-name">{user.displayName ?? 'Player'}</span>
          <button className="player-badge-signout" onClick={onSignOut} title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      )}

      <motion.div
        className="logo-container"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        <img src="/logo.jpg" alt="Cardio Surfer Logo" className="app-logo-img" />
      </motion.div>

      <motion.h1
        className="title"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        CARDIO SURFER
      </motion.h1>

      <motion.p
        className="subtitle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        The 3-Lane Hand-Steered Endless Runner. Raise right/left hand to switch lanes, jump and squat to dodge!
      </motion.p>

      {highScore > 0 && (
        <motion.div
          className="high-score-badge"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Trophy className="badge-icon gold" size={16} /> BEST SCORE: <span>{highScore}</span>
        </motion.div>
      )}

      <motion.div
        className="rules-card"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        <div className="rule-item">
          <div className="rule-icon purple">
            <Hand size={20} />
          </div>
          <div>
            <strong>Raise Right / Left Hand</strong> to shift 1 lane right or left (lift twice = 2 lanes!)
          </div>
        </div>
        <div className="rule-item">
          <div className="rule-icon teal">
            <ArrowUp size={20} />
          </div>
          <div>
            <strong>Jump in place</strong> over low obstacle hurdles
          </div>
        </div>
        <div className="rule-item">
          <div className="rule-icon amber">
            <ArrowDown size={20} />
          </div>
          <div>
            <strong>Squat / Duck down</strong> under overhead lasers
          </div>
        </div>
      </motion.div>

      {error && (
        <motion.p className="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {error}
        </motion.p>
      )}

      <motion.div
        className="actions-row"
        initial={{ y: 15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <button className="primary-btn pulse" onClick={onStart} disabled={loading}>
          {loading ? (
            <>
              <Activity className="spin" size={18} /> Loading Pose Model…
            </>
          ) : (
            <>
              <Camera size={20} /> ENABLE CAMERA & PLAY
            </>
          )}
        </button>

        <button className="icon-btn" onClick={onViewLeaderboard} title="Leaderboard">
          <Trophy size={20} />
        </button>

        <button
          className="icon-btn"
          onClick={() => setShowTutorial(true)}
          title="How to Play Tutorial Guide"
        >
          <HelpCircle size={20} />
        </button>

        <button
          className="icon-btn"
          onClick={toggleSound}
          title={muted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </motion.div>

      <p className="hint">
        💡 Keyboard arrows (↑ ↓ ← →) & Space bar also work as manual fallback!
      </p>

      <AdBanner />

      {/* First-time Tutorial Modal */}
      <AnimatePresence>
        {showTutorial && <TutorialGuideModal onClose={handleCloseTutorial} />}
      </AnimatePresence>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/StartScreen.test.tsx
```

Expected: PASS, 4/4 cases.

- [ ] **Step 5: Typecheck**

```bash
npx tsc -b
```

Expected: FAILS at this point — `App.tsx` still calls `<StartScreen onStart={...} error={...} loading={...} />` without the three new required props. This is expected; Task 10 fixes it. Confirm the *only* error is in `App.tsx` (not inside `StartScreen.tsx` itself) before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/components/StartScreen.tsx src/components/StartScreen.test.tsx
git commit -m "frontend: add leaderboard button and player badge to StartScreen"
```

---

### Task 9: Modify `GameOverScreen`

**Files:**
- Modify: `src/components/GameOverScreen.tsx`
- Test: `src/components/GameOverScreen.test.tsx` (new)

Adds a "Weekly Rank" badge (dash placeholder until resolved, per the approved design) and a separate "View Leaderboard" link.

- [ ] **Step 1: Write the failing tests**

`src/components/GameOverScreen.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameOverScreen from './GameOverScreen';
import type { GameStats } from '../game/types';

// highScore is deliberately higher than score so isNewHigh stays false —
// the confetti celebration path is pre-existing behavior out of scope for
// this task, and canvas-confetti needs a 2D canvas context jsdom doesn't
// provide by default.
const baseStats: GameStats = {
  score: 500,
  highScore: 900,
  distanceM: 120,
  coins: 10,
  jumps: 5,
  ducks: 3,
  laneChanges: 8,
  elapsedMs: 60000,
  caloriesBurnt: 25,
  activePowerUps: { magnet: false, shield: false, star: false, magnetTimeLeft: 0, starTimeLeft: 0 },
};

describe('GameOverScreen', () => {
  it('shows a rank placeholder when rank is not yet known', () => {
    render(
      <GameOverScreen
        stats={baseStats}
        reason={null}
        rank={null}
        onRestart={() => {}}
        onViewLeaderboard={() => {}}
      />,
    );

    expect(screen.getByText('Weekly Rank —')).toBeInTheDocument();
  });

  it('shows the resolved rank once known', () => {
    render(
      <GameOverScreen
        stats={baseStats}
        reason={null}
        rank={7}
        onRestart={() => {}}
        onViewLeaderboard={() => {}}
      />,
    );

    expect(screen.getByText('#7')).toBeInTheDocument();
  });

  it('calls onViewLeaderboard when the leaderboard link is clicked', () => {
    const onViewLeaderboard = vi.fn();
    render(
      <GameOverScreen
        stats={baseStats}
        reason={null}
        rank={null}
        onRestart={() => {}}
        onViewLeaderboard={onViewLeaderboard}
      />,
    );

    fireEvent.click(screen.getByText(/view leaderboard/i));
    expect(onViewLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('calls onRestart when PLAY AGAIN is clicked', () => {
    const onRestart = vi.fn();
    render(
      <GameOverScreen
        stats={baseStats}
        reason={null}
        rank={null}
        onRestart={onRestart}
        onViewLeaderboard={() => {}}
      />,
    );

    fireEvent.click(screen.getByText(/play again/i));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/GameOverScreen.test.tsx
```

Expected: FAIL — `rank`/`onViewLeaderboard` props and the elements they render don't exist yet.

- [ ] **Step 3: Replace `GameOverScreen.tsx`**

`src/components/GameOverScreen.tsx`:

```tsx
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Trophy,
  RotateCcw,
  Sparkles,
  Coins,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  Flame,
  Activity,
  HeartPulse,
  Medal,
} from 'lucide-react';
import type { GameStats } from '../game/types';
import AdBanner from './AdBanner';

interface Props {
  stats: GameStats;
  reason: string | null;
  rank: number | null;
  onRestart: () => void;
  onViewLeaderboard: () => void;
}

export default function GameOverScreen({ stats, reason, rank, onRestart, onViewLeaderboard }: Props) {
  const isNewHigh = Math.floor(stats.score) >= stats.highScore && stats.score > 0;

  useEffect(() => {
    if (isNewHigh) {
      const duration = 2.5 * 1000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#00f0ff', '#ff00c8', '#ffea00'],
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#00f0ff', '#ff00c8', '#ffea00'],
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [isNewHigh]);

  const calories = (stats.caloriesBurnt || 0).toFixed(1);
  const squatCal = (stats.ducks * 0.32).toFixed(1);
  const jumpCal = (stats.jumps * 0.2).toFixed(1);
  const runCal = (stats.distanceM * 0.065).toFixed(1);
  const durationSec = Math.ceil(stats.elapsedMs / 1000);

  return (
    <motion.div
      className="screen overlay game-over-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="game-over-logo-wrap"
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <img src="/logo.jpg" alt="Cardio Surfer Logo" className="game-over-logo" />
      </motion.div>

      <h1 className="title game-over-title">GAME OVER</h1>

      {isNewHigh ? (
        <motion.div
          className="new-record-banner"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <Sparkles size={18} /> NEW HIGH SCORE RECORD! <Sparkles size={18} />
        </motion.div>
      ) : (
        reason && <p className="subtitle reason-text">{reason}</p>
      )}

      {/* 🔥 FITNESS & CALORIES BURNED HERO CARD */}
      <motion.div
        className="calories-hero-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="calories-hero-header">
          <Flame size={24} className="flame-icon" />
          <span className="calories-val">{calories}</span>
          <span className="calories-unit">kcal BURNED</span>
        </div>
        <div className="calories-subtext">
          <HeartPulse size={14} /> Great workout! Active cardio duration: {durationSec}s
        </div>
      </motion.div>

      <motion.div
        className="stats-card"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="main-score-display">
          <div className="main-score-val">{Math.floor(stats.score)}</div>
          <div className="main-score-lbl">FINAL SCORE</div>
        </div>

        <div className="weekly-rank-badge">
          <Medal size={16} className="gold" />
          {rank !== null ? (
            <span>
              Weekly Rank <strong>#{rank}</strong>
            </span>
          ) : (
            <span>Weekly Rank —</span>
          )}
        </div>

        <div className="stats-grid">
          <div>
            <div className="stat-value icon-stat">
              <Trophy size={16} className="gold" /> {stats.highScore}
            </div>
            <div className="stat-label">Best Score</div>
          </div>
          <div>
            <div className="stat-value">📏 {Math.floor(stats.distanceM)}m</div>
            <div className="stat-label">Distance ({runCal} kcal)</div>
          </div>
          <div>
            <div className="stat-value icon-stat">
              <Coins size={16} className="amber" /> {stats.coins}
            </div>
            <div className="stat-label">Coins</div>
          </div>
          <div>
            <div className="stat-value icon-stat">
              <ArrowUp size={16} className="teal" /> {stats.jumps}
            </div>
            <div className="stat-label">Jumps ({jumpCal} kcal)</div>
          </div>
          <div>
            <div className="stat-value icon-stat">
              <ArrowDown size={16} className="pink" /> {stats.ducks}
            </div>
            <div className="stat-label">Squats ({squatCal} kcal)</div>
          </div>
          <div>
            <div className="stat-value icon-stat">
              <ArrowLeftRight size={16} className="purple" /> {stats.laneChanges}
            </div>
            <div className="stat-label">Steps</div>
          </div>
        </div>
      </motion.div>

      <motion.button
        className="primary-btn pulse"
        onClick={onRestart}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <RotateCcw size={20} /> PLAY AGAIN
      </motion.button>

      <button className="text-link" onClick={onViewLeaderboard}>
        View Leaderboard →
      </button>

      <AdBanner />
    </motion.div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/GameOverScreen.test.tsx
```

Expected: PASS, 4/4 cases.

- [ ] **Step 5: Typecheck**

```bash
npx tsc -b
```

Expected: still FAILS in `App.tsx` (now for both `StartScreen` and `GameOverScreen` prop mismatches) — expected until Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/components/GameOverScreen.tsx src/components/GameOverScreen.test.tsx
git commit -m "frontend: add weekly rank badge and leaderboard link to GameOverScreen"
```

---

### Task 10: Wire it all together in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

This is the integration task: the screen state machine grows two states, sign-in gates `PLAY`, a completed run gets submitted with a silent-fail rank lookup, and the leaderboard is reachable from both `StartScreen` and `GameOverScreen`. No new automated test here — `App.tsx` orchestrates camera/pose-tracker/engine APIs that aren't practically unit-testable in `jsdom` (the existing codebase has no `App.test.tsx` either); this task's verification is typecheck + the full existing suite + a production build, with the actual integrated flow covered by the manual smoke test in Task 11.

- [ ] **Step 1: Replace `App.tsx`**

`src/App.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play } from 'lucide-react';
import './App.css';
import { GameEngine } from './game/GameEngine';
import { PoseTracker, type PoseDebugState } from './pose/PoseTracker';
import { useAuth } from './firebase/useAuth';
import { getLeaderboard, submitRun, syncUser } from './api/client';
import StartScreen from './components/StartScreen';
import SignInScreen from './components/SignInScreen';
import CalibrationScreen from './components/CalibrationScreen';
import GameCanvas from './components/GameCanvas';
import CameraPreview from './components/CameraPreview';
import HUD from './components/HUD';
import GameOverScreen from './components/GameOverScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import type { GameSnapshot, GameStats } from './game/types';

type Screen = 'start' | 'signing-in' | 'calibrating' | 'playing' | 'gameover' | 'leaderboard';

export default function App() {
  const engine = useMemo(() => new GameEngine(), []);
  const poseTracker = useMemo(() => new PoseTracker(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submittedRef = useRef(false);

  const { user, signIn, signOut } = useAuth();

  const [screen, setScreen] = useState<Screen>('start');
  const [leaderboardOrigin, setLeaderboardOrigin] = useState<'start' | 'gameover'>('start');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [debug, setDebug] = useState<PoseDebugState | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    status: 'idle',
    stats: engine.getStats(),
  });

  const setupCamera = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await poseTracker.init();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      poseTracker.start(videoRef.current!);
      setScreen('calibrating');
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access and try again.'
          : 'Could not start camera or pose landmarker. You can still test with keyboard fallback!',
      );
      // Camera failures always surface via StartScreen's existing error UI,
      // whether setupCamera was triggered directly from Start (already
      // there — this is a no-op) or from just after a successful sign-in
      // (SignInScreen has no camera-error UI of its own).
      setScreen('start');
    } finally {
      setLoading(false);
    }
  }, [poseTracker]);

  const submitRunAndFetchRank = useCallback(
    async (stats: GameStats) => {
      if (!user) return;
      const result = await submitRun(user, {
        score: Math.floor(stats.score),
        calories: stats.caloriesBurnt,
        durationSec: Math.ceil(stats.elapsedMs / 1000),
      }).catch(() => null);
      if (!result || !result.ok) return;

      const leaderboard = await getLeaderboard('weekly').catch(() => null);
      if (!leaderboard) return;
      const myIndex = leaderboard.entries.findIndex((entry) => entry.uid === user.uid);
      if (myIndex !== -1) setRank(myIndex + 1);
    },
    [user],
  );

  // Subscribe to engine + pose tracker once.
  useEffect(() => {
    const unsubEngine = engine.subscribe((snap) => {
      setSnapshot(snap);
      if (snap.status === 'gameover') {
        setScreen('gameover');
        if (!submittedRef.current) {
          submittedRef.current = true;
          void submitRunAndFetchRank(snap.stats);
        }
      }
    });
    const unsubDebug = poseTracker.onDebug(setDebug);
    const unsubAction = poseTracker.onAction((action) => engine.handleAction(action));
    return () => {
      unsubEngine();
      unsubDebug();
      unsubAction();
    };
  }, [engine, poseTracker, submitRunAndFetchRank]);

  // Keyboard fallback so the game can be tested/played without a camera.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (screen === 'playing' || snapshot.status === 'paused') {
          engine.handleAction('TOGGLE_PAUSE');
          return;
        }
      }
      if (screen !== 'playing') return;
      if (e.code === 'ArrowUp' || e.code === 'Space') engine.handleAction('JUMP');
      if (e.code === 'ArrowDown') engine.handleAction('DUCK_START');
      if (e.code === 'ArrowLeft') engine.handleAction('MOVE_LEFT');
      if (e.code === 'ArrowRight') engine.handleAction('MOVE_RIGHT');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (screen !== 'playing') return;
      if (e.code === 'ArrowDown') engine.handleAction('DUCK_END');
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [engine, screen, snapshot.status]);

  const handlePlayTap = useCallback(() => {
    if (!user) {
      setSignInError(null);
      setScreen('signing-in');
      return;
    }
    void setupCamera();
  }, [user, setupCamera]);

  const handleSignIn = useCallback(async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      const signedInUser = await signIn();
      syncUser(signedInUser).catch(() => {});
      await setupCamera();
    } catch (e) {
      console.error(e);
      setSignInError('Could not sign in. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }, [signIn, setupCamera]);

  const handleCalibrationDone = useCallback(() => {
    poseTracker.calibrateNow();
    submittedRef.current = false;
    setRank(null);
    engine.start();
    setScreen('playing');
  }, [engine, poseTracker]);

  const handleRestart = useCallback(() => {
    submittedRef.current = false;
    setRank(null);
    if (poseTracker.isCalibrated()) {
      engine.start();
      setScreen('playing');
    } else {
      setScreen('calibrating');
    }
  }, [engine, poseTracker]);

  const handleTogglePause = useCallback(() => {
    engine.togglePause();
  }, [engine]);

  const openLeaderboard = useCallback(() => {
    setLeaderboardOrigin(screen === 'gameover' ? 'gameover' : 'start');
    setScreen('leaderboard');
  }, [screen]);

  const closeLeaderboard = useCallback(() => {
    setScreen(leaderboardOrigin);
  }, [leaderboardOrigin]);

  useEffect(() => {
    return () => {
      poseTracker.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cameraMode = screen === 'calibrating' ? 'full' : screen === 'start' ? 'hidden' : 'mini';

  return (
    <div className="app">
      {/* Portrait-clamped game frame — the 3D canvas, HUD, and camera preview all
          live inside this shared box so they stay visually locked together instead
          of the HUD pinning to the full (possibly very wide) browser window while
          the canvas letterboxes down to portrait inside it. */}
      <div className="game-frame">
        {/* Always mounted camera preview */}
        <CameraPreview videoRef={videoRef} debug={debug} mode={cameraMode} />

        <AnimatePresence mode="wait">
          {screen === 'start' && (
            <StartScreen
              key="start"
              onStart={handlePlayTap}
              onViewLeaderboard={openLeaderboard}
              onSignOut={() => void signOut()}
              user={user}
              error={error}
              loading={loading}
            />
          )}

          {screen === 'signing-in' && (
            <SignInScreen
              key="signing-in"
              onSignIn={() => void handleSignIn()}
              onBack={() => setScreen('start')}
              error={signInError}
              loading={signingIn || loading}
            />
          )}

          {screen === 'leaderboard' && (
            <LeaderboardScreen key="leaderboard" currentUser={user} onBack={closeLeaderboard} />
          )}

          {screen === 'calibrating' && (
            <CalibrationScreen key="calibrating" debug={debug} onDone={handleCalibrationDone} />
          )}

          {(screen === 'playing' || screen === 'gameover') && (
            <div key="play" className="play-area">
              <GameCanvas engine={engine} />
              <HUD
                stats={snapshot.stats}
                debug={debug}
                onTogglePause={handleTogglePause}
                isPaused={snapshot.status === 'paused'}
              />

              {snapshot.status === 'paused' && (
                <motion.div
                  className="screen overlay pause-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="title">GAME PAUSED</h2>
                  <p className="subtitle">Take a breather! Resume when you're ready.</p>
                  <button className="primary-btn" onClick={handleTogglePause}>
                    <Play size={20} /> RESUME GAME
                  </button>
                </motion.div>
              )}

              {screen === 'gameover' && (
                <GameOverScreen
                  stats={snapshot.stats}
                  reason={engine.getGameOverReason()}
                  rank={rank}
                  onRestart={handleRestart}
                  onViewLeaderboard={openLeaderboard}
                />
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append the new styles to `App.css`**

Append to the end of `src/App.css`:

```css
/* ---------- Player badge (StartScreen, signed-in state) ---------- */

.player-badge {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  padding: 6px 10px 6px 6px;
}

.player-badge-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
}

.player-badge-avatar.placeholder {
  background: rgba(0, 240, 255, 0.25);
}

.player-badge-name {
  font-size: 12px;
  color: #e2e8f0;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-badge-signout {
  background: none;
  border: none;
  color: #b8c0d6;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
}

.player-badge-signout:hover {
  color: #ff5252;
}

/* ---------- Sign-in screen ---------- */

.sign-in-screen {
  background: radial-gradient(circle at center, #1b1536 0%, #080711 100%);
}

.text-link {
  background: none;
  border: none;
  color: #00f0ff;
  font-size: 13px;
  cursor: pointer;
  padding: 6px;
}

.text-link:hover {
  text-decoration: underline;
}

/* ---------- Weekly rank badge (GameOverScreen) ---------- */

.weekly-rank-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  color: #ffd700;
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  margin: 4px 0;
}

/* ---------- Leaderboard screen ---------- */

.leaderboard-screen {
  background: radial-gradient(circle at center, #1b1536 0%, #080711 100%);
  justify-content: flex-start;
  padding-top: 24px;
}

.leaderboard-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 440px;
}

.leaderboard-header .title {
  font-size: 24px;
}

.leaderboard-tabs {
  display: flex;
  width: 100%;
  max-width: 440px;
  gap: 8px;
  margin-top: 8px;
}

.tab {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #b8c0d6;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  cursor: pointer;
}

.tab.active {
  background: rgba(0, 240, 255, 0.15);
  border-color: rgba(0, 240, 255, 0.4);
  color: #00f0ff;
}

.leaderboard-list {
  width: 100%;
  max-width: 440px;
  overflow-y: auto;
  flex: 1;
}

.leaderboard-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 14px;
  color: #e2e8f0;
}

.leaderboard-row.you {
  background: rgba(0, 240, 255, 0.08);
  border-radius: 8px;
}

.leaderboard-rank {
  width: 26px;
  text-align: center;
  color: #7e8b9b;
  font-weight: 700;
}

.leaderboard-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.leaderboard-avatar.placeholder {
  background: rgba(0, 240, 255, 0.25);
}

.leaderboard-name {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaderboard-score {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  color: #ffd700;
}

.leaderboard-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

/* ---------- Ad banner slot ---------- */

.ad-banner {
  width: 100%;
  max-width: 440px;
  min-height: 50px;
  flex-shrink: 0;
}

.ad-banner-placeholder {
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc -b
```

Expected: passes with no errors.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all test files from Tasks 1–9 pass (no new tests added in this task, no regressions).

- [ ] **Step 5: Production build**

```bash
npm run build
```

Expected: succeeds, `dist/` created. (This will succeed even without a real `.env.local` — Vite just inlines empty strings for unset `VITE_*` vars — but the app won't function correctly at runtime without real Firebase/API values, which Task 11 addresses.)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "frontend: wire sign-in, run submission, and leaderboard navigation into App.tsx"
```

---

### Task 11: Manual local smoke test

This task needs a real Firebase Web App config and cannot be done by an implementer subagent — it requires an actual browser, a real Google account, and (if not already done) registering a Web app in the `cardio-surfer` Firebase project. **The controlling agent/session should walk the human user through this directly**, the same way Task 10 of the backend plan required direct user action for `wrangler login` and Firebase project setup.

**Files:** none (verification only, no commit).

- [ ] **Step 1: Confirm `.env.local` has real values**

Check whether `.env.local` exists in the repo root with real values for all vars listed in `.env.example`. `VITE_API_URL` is already known (`https://subway-fit-api.subway-fit-worker.workers.dev`). The `VITE_FIREBASE_*` values require a Web app to be registered in the Firebase console (Project Settings → your apps → add a Web app, if not already done) — if this hasn't happened yet, stop here and get it from the user before continuing.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: prints a local URL (e.g. `http://localhost:5173`).

- [ ] **Step 3: Walk through the flow in a browser**

Open the printed URL and verify, in order:
1. Start screen loads with no player badge (signed out).
2. Tapping the Trophy/Leaderboard icon shows the (likely empty) leaderboard without requiring sign-in; back returns to Start.
3. Tapping `ENABLE CAMERA & PLAY` shows the full-screen "Sign in with Google" prompt instead of a camera permission dialog.
4. Signing in with a real Google account immediately proceeds to the camera permission prompt, then Calibration — no extra tap needed.
5. Back on Start (after signing in, via the back arrow or a refresh), the player badge now shows the signed-in Google account's name/photo.
6. Playing a run to completion (or using arrow-key fallback) reaches Game Over showing Score and Calories immediately, with "Weekly Rank —" that updates to a real rank number within a couple seconds.
7. Tapping "View Leaderboard →" from Game Over shows the just-played run on the Weekly tab; switching to All-Time still shows it.
8. Tapping the player badge's sign-out icon returns to a signed-out Start screen.

If any step fails, treat it as a bug to fix before proceeding — do not defer to Task 12.

- [ ] **Step 4: Stop the dev server**

No commit — this task is verification only.

---

### Task 12: Deploy to Cloudflare Pages

**Files:**
- Modify: `package.json`
- Modify: `worker/wrangler.toml`

The last step: publish the built frontend to Cloudflare Pages (keeping everything on one provider/bill, per the earlier hosting decision), then point the already-deployed worker's CORS config at the real production origin.

- [ ] **Step 1: Add Wrangler and a deploy script**

In `package.json`, add `"wrangler": "^4.123.0"` to `devDependencies`, and add a `deploy` script:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run",
    "deploy": "vite build && wrangler pages deploy dist --project-name=subway-fit-frontend"
  },
```

```bash
npm install
```

- [ ] **Step 2: Confirm Cloudflare login is still active**

```bash
npx wrangler whoami
```

Expected: shows the already-authenticated account from the backend plan's Task 10. If it reports not logged in, run `npx wrangler login` again (same browser-authorization flow as before).

- [ ] **Step 3: Build and deploy**

```bash
npm run deploy
```

Expected: on first deploy, Wrangler creates the `subway-fit-frontend` Pages project automatically and prints a live URL like `https://subway-fit-frontend.pages.dev` (or a deployment-specific subdomain of it). Save this URL.

Note: since this deploys an already-built `dist/` folder, the `VITE_*` env values are baked into the static JS bundle at the `vite build` step on your machine (from your local `.env.local`) — there's no separate "set environment variables in the Cloudflare Pages dashboard" step needed for this deploy method.

- [ ] **Step 4: Add the Pages domain to Firebase's authorized domains**

Google Sign-In only works from domains Firebase explicitly trusts. In the Firebase console: Authentication → Settings → Authorized domains → Add domain → enter the `*.pages.dev` domain from Step 3 (and your own custom domain later, if you add one). `localhost` should already be listed by default from local testing.

- [ ] **Step 5: Update the worker's `ALLOWED_ORIGIN`**

In `worker/wrangler.toml`, change:

```toml
[vars]
ALLOWED_ORIGIN = "http://localhost:5173"
```

to the real Pages URL from Step 3, e.g.:

```toml
[vars]
ALLOWED_ORIGIN = "https://subway-fit-frontend.pages.dev"
```

- [ ] **Step 6: Redeploy the worker with the updated CORS origin**

```bash
cd worker && npx wrangler deploy
```

Expected: redeploys successfully (env var changes require a redeploy to take effect).

- [ ] **Step 7: Smoke-test the live deployment**

Open the Pages URL from Step 3 in a browser and repeat the same checklist as Task 11's Step 3, end to end, against the real production frontend + worker + Firebase project.

- [ ] **Step 8: Commit**

```bash
cd .. && git add package.json package-lock.json worker/wrangler.toml
git commit -m "frontend: deploy to Cloudflare Pages, update worker CORS origin"
```

---

## Plan self-review notes

- **Spec coverage:** sign-in gating (Tasks 3, 6, 8, 10), run submission with silent-fail rank lookup (Tasks 4, 10), leaderboard viewable with/without auth from both Start and Game Over (Tasks 4, 7, 8, 9, 10), calorie display (already existed, unchanged), AdMob placeholder slot (Task 5), sign-out (Tasks 8, 10), `GET /me/history` wired but no UI per the design's explicit non-goal (Task 4), the design's known top-N-only rank limitation (Task 10's `submitRunAndFetchRank`), and both manual-setup gaps from the design doc's §9 (Firebase Web App config — Task 11; Cloudflare Pages + Firebase authorized domains + `ALLOWED_ORIGIN` — Task 12).
- **Not covered here, by design:** a dedicated "my run history" screen, real AdMob SDK integration (only the placeholder slot), and any backend changes (the plan this depends on is already deployed and untouched).
- **Type consistency:** `RunSubmission`, `LeaderboardEntry`, `LeaderboardResponse`, `HistoryEntry`, `HistoryResponse`, `SubmitRunResult` defined once in `api/types.ts` (Task 4) and imported everywhere else. `Screen` type is defined once in `App.tsx` (Task 10). `StartScreenUser` is a narrow structural subset of Firebase's `User` (Task 8), deliberately decoupling `StartScreen` from the `firebase/auth` package for isolation/testability.
