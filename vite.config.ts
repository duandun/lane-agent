import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import path from 'path';

const resolve = (dir: string) => path.resolve(import.meta.dirname, dir);

export default defineConfig({
  root: 'src/web',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': resolve('src'),
      '@core': resolve('src/core'),
      '@web': resolve('src/web'),
      '@app': resolve('src/app'),
      '@assets': resolve('src/assets'),
    },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
