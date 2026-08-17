import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // The worker/ directory is an independent project with its own
      // package.json, node_modules, and vitest.config.ts (Cloudflare
      // Workers pool). Without this exclude, vitest's default file
      // discovery also picks up worker/test/*.test.ts from the repo
      // root and fails to resolve their worker-only deps (jose,
      // cloudflare:test).
      exclude: [...configDefaults.exclude, 'worker/**'],
    },
  }),
);
