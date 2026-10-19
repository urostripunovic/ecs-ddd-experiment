import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built game also runs from a subfolder or file share.
  base: './',
  // three.js alone is ~600 kB minified; splitting it buys nothing for a greybox.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The source scans (units, docs drift) list files with import.meta.glob when a
    // test is transformed. A cached transform keeps the old file list, so a new
    // file would go unchecked and the scan would pass falsely.
    fsModuleCache: false,
  },
});
