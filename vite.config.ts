import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'systeminformation', 'electron-store'],
            },
          },
          resolve: {
            alias: {
              '@core': path.resolve(__dirname, 'core'),
              '@ai': path.resolve(__dirname, 'ai'),
              '@tools': path.resolve(__dirname, 'tools'),
              '@tasks': path.resolve(__dirname, 'tasks'),
              '@config': path.resolve(__dirname, 'config'),
              '@shared': path.resolve(__dirname, 'shared'),
            },
          },
        },
      },
      preload: {
        input: 'electron/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            // CJS preload is the most reliable under Electron contextBridge.
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'index.cjs',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'core'),
      '@ai': path.resolve(__dirname, 'ai'),
      '@tools': path.resolve(__dirname, 'tools'),
      '@tasks': path.resolve(__dirname, 'tasks'),
      '@config': path.resolve(__dirname, 'config'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
