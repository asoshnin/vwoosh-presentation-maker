import { defineConfig } from 'vitest/config';

// Sprint 02 (P0-5) harness config.
//
// backend/auth-server.js binds :3002 at import time and exports no handle
// (product code is out of scope for this sprint, so it stays that way).
// singleFork + isolate:false keep ONE worker + ONE module registry so all
// test files share a single backend import instead of EADDRINUSE-crashing.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    isolate: false,
    sequence: { shuffle: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
