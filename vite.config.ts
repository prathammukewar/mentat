import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  root: 'web',
  // GitHub Pages serves the site from /mentat/. The dev server stays at /.
  base: command === 'build' || isPreview ? '/mentat/' : '/',
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
}));
