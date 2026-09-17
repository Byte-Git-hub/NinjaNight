import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

function cleanDistOriginals() {
  return {
    name: 'clean-dist-originals',
    closeBundle() {
      const distDir = path.resolve('dist');
      const walk = (d: string) => {
        if (!fs.existsSync(d)) return;
        for (const f of fs.readdirSync(d)) {
          const p = path.join(d, f);
          if (fs.statSync(p).isDirectory()) {
            if (f === '_originals') {
              fs.rmSync(p, { recursive: true, force: true });
            } else {
              walk(p);
            }
          }
        }
      };
      walk(distDir);
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [cleanDistOriginals()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    passWithNoTests: true,
  },
});
