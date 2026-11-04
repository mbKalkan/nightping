import { defineConfig } from 'vitest/config';

// Real agent turns: run by hand (`npm run test:agents`), not in CI. They use the account each
// agent is signed in with.
export default defineConfig({
  test: {
    include: ['test/agents/**/*.test.ts'],
    environment: 'node',
    testTimeout: 300_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
