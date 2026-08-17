import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Scoped to src/ rather than excluding worker/ by name, so this
      // config doesn't need updating every time a new independent
      // top-level project (worker/ today, possibly others later) gets
      // its own test suite outside src/.
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
);
