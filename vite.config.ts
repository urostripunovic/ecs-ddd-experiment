import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built game also runs from a subfolder or file share.
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
