import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so a built copy works from any folder: the root of a
  // domain, a subdirectory on shared hosting, or a GitHub Pages project site.
  base: './',
  server: { port: 5173, open: false },
  css: { preprocessorOptions: { scss: { api: 'modern-compiler' } } },
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
});
