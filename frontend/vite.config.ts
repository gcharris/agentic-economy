// Vite config (scaffold lane). Two HTML entries: index.html (the app) and
// design/index.html (the design-page lane's page; tolerated when absent so the
// scaffold builds before that lane exists). GLSL chunks (#include) go through
// vite-plugin-glsl; the shader files themselves are the gpu part of the scaffold.
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const input: Record<string, string> = { main: here('./index.html') };
if (existsSync(here('./design/index.html'))) input.design = here('./design/index.html');

export const aliases = {
  '@engine': here('./src/engine'),
  '@scene': here('./src/scene'),
  '@ui': here('./src/ui'),
  '@app': here('./src/app'),
};

export default defineConfig({
  plugins: [glsl({ include: ['**/*.glsl', '**/*.vert', '**/*.frag'], minify: false, root: '/src/engine/gpu/shaders/' })],
  resolve: { alias: aliases },
  build: { target: 'es2022', rollupOptions: { input } },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
