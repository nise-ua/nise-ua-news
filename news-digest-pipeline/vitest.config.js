import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.js',
      'production/lib/__tests__/**/*.test.js',
    ],
    exclude: [
      'node_modules/**',
      // Existing production/lib/*.test.js files use node:test, not vitest.
      // Run them with: node --test production/lib/*.test.js
      'production/lib/*.test.js',
    ],
  },
});
