import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Basis, damit der Build auch aus einem Unterordner heraus
  // ausgeliefert werden kann (GitHub Pages, statisches Hosting, Vercel, Netlify).
  base: './',
  server: {
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
});
