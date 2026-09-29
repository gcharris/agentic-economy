// Vitest projects: `unit` (node: sources, layout, slots, clips, the real wasm)
// and `dom` (jsdom + tests/setup.ts: the Door, the Note, the HUD, the
// no-leaderboard scan, replayed through TraceSource with a NullRenderer).
//   npx vitest run --project unit
//   npx vitest run --project dom tests/dom/door.test.ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const alias = {
  '@engine': here('./src/engine'),
  '@scene': here('./src/scene'),
  '@ui': here('./src/ui'),
  '@app': here('./src/app'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['tests/setup.ts'],
          include: ['tests/dom/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
