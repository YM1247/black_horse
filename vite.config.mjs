import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/black_horse/',
  plugins: [react()],
  build: {
    outDir: 'build',
    emptyOutDir: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    css: true,
    exclude: ['tests/firestore.rules.test.js', 'node_modules/**', 'build/**']
  }
});
