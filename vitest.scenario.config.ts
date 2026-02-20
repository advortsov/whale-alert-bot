import { defineConfig } from 'vitest/config';

const SCENARIO_TEST_TIMEOUT = 15_000;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/scenarios/**/*.scenario-spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    pool: 'forks',
    testTimeout: SCENARIO_TEST_TIMEOUT,
  },
});
