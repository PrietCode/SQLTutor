import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { pretendToBeVisual: true }
    },
    include: ['src/**/*.test.jsx'],
    setupFiles: ['./src/test/setup.js']
  },
});
