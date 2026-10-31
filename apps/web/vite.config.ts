import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: '../../static',
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_BFF_ORIGIN ?? 'http://localhost:4100',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../../.artifacts/v2-web',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['@tanstack/react-router', '@tanstack/react-query'],
        },
      },
    },
  },
});
