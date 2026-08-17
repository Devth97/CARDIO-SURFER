import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react's auto-cleanup only registers itself when it finds
// a global `afterEach` (see its index.js). This project's vitest config does
// not set `test.globals: true`, so that auto-registration never fires and
// DOM from one test leaks into the next within the same file. Register
// cleanup explicitly so multiple render() calls per test file behave as
// RTL users normally expect.
afterEach(() => {
  cleanup();
});
