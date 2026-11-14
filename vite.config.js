import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two pages: flight (index.html) and the Jezero colony (colony.html).
export default defineConfig({
  base: './',
  // Full-mission sim tests take seconds; allow headroom when the machine is busy.
  test: { testTimeout: 30000 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        colony: resolve(import.meta.dirname, 'colony.html')
      }
    }
  }
});
