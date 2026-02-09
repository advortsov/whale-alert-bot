import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['dist-test/test/**/*.e2e-spec.js'],
    exclude: ['node_modules/**'],
    pool: 'forks',
  },
});
