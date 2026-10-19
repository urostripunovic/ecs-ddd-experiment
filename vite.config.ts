import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built game also runs from a subfolder or file share.
  base: './',
  // three.js alone is ~600 kB minified; splitting it buys nothing for a greybox.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
