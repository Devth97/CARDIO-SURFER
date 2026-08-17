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
