import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

export default defineConfig({
  root: fileURLToPath(new URL('./frontend', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  resolve: {
    alias: {
      'next/link': fileURLToPath(new URL('./frontend/link.tsx', import.meta.url)),
      'next/image': fileURLToPath(new URL('./frontend/image.tsx', import.meta.url)),
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  build: { outDir: '../../dist/aws/website', emptyOutDir: true },
});
