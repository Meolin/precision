import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The app is sometimes embedded by a local preview surface on another localhost origin.
  // Make development and production preview behavior explicit and consistent.
  server: {
    host: '127.0.0.1',
    strictPort: true,
    cors: true,
  },
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    cors: true,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
