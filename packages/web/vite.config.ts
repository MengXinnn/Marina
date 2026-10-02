import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps the build portable (GitHub Pages sub-path, opening from a folder, etc.).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
