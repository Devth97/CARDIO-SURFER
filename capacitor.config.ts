/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cardiosurfer.app',
  appName: 'Cardio Surfer',
  server: {
    url: 'https://subway-fit-frontend.subway-fit-worker.workers.dev',
    allowNavigation: ['subway-fit-frontend.subway-fit-worker.workers.dev'],
  },
  plugins: {
    // Without this, @capacitor-firebase/authentication's Android
    // GoogleAuthProviderHandler is never instantiated (its `providers`
    // config defaults to an empty array), and calling signIn() throws a
    // NullPointerException instead of showing the native account picker —
    // this was the actual root cause of the "Could not sign in" failures.
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
