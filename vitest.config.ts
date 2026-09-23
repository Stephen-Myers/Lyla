import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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
});
