import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          terminal: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
