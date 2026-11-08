import { defineConfig } from 'vitest/config';

/** The standards shared with krimadev.com and Star Teller (tests/rules, tests/live). */
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'rules', include: ['tests/rules/**/*.test.ts'] } },
      { test: { name: 'live', include: ['tests/live/**/*.test.ts'], testTimeout: 30_000 } },
    ],
  },
});
