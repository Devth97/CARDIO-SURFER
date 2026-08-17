import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 20+ ships an experimental global `localStorage`/`sessionStorage` that,
// without a `--localstorage-file` backing path, returns a non-functional stub
// (present, but its methods throw/are missing). jsdom's own environment setup
// detects that a `localStorage` global already exists and defers to it rather
// than installing its own working implementation — so on affected Node
// versions, any module that reads `localStorage` at import time (e.g.
// SoundManager's module-level singleton) crashes. That crash happens during
// module import, which happens before any hook runs — so this polyfill must
// be installed synchronously here at the top level of the setup file (which
// Vitest loads before importing any test file), not inside a beforeEach.
class MemoryStorage implements Storage {
  #data = new Map<string, string>();

  get length(): number {
    return this.#data.size;
  }

  clear(): void {
    this.#data.clear();
  }

  getItem(key: string): string | null {
    return this.#data.has(key) ? this.#data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.#data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.#data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#data.set(key, String(value));
  }
}

function installMemoryStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

// Install once immediately so it's in place before the first test file's
// module-level code (e.g. the soundManager singleton) ever runs...
installMemoryStorage();

// ...and reinstall fresh before every test, so state doesn't leak between
// tests the way DOM would without the cleanup() hook below.
beforeEach(() => {
  installMemoryStorage();
});

// @testing-library/react's auto-cleanup only registers itself when it finds
// a global `afterEach` (see its index.js). This project's vitest config does
// not set `test.globals: true`, so that auto-registration never fires and
// DOM from one test leaks into the next within the same file. Register
// cleanup explicitly so multiple render() calls per test file behave as
// RTL users normally expect.
afterEach(() => {
  cleanup();
});
