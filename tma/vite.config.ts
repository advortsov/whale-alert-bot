import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolveVendorChunk = (moduleId: string): string | undefined => {
  if (!moduleId.includes('node_modules')) {
    return undefined;
  }

  if (moduleId.includes('react-router-dom') || moduleId.includes('/react-router/')) {
    return 'vendor-router';
  }

  if (moduleId.includes('@tanstack/react-query')) {
    return 'vendor-query';
  }

  if (moduleId.includes('@telegram-apps/')) {
    return 'vendor-telegram';
  }

  if (moduleId.includes('react') || moduleId.includes('scheduler')) {
    return 'vendor-react';
  }

  return 'vendor-misc';
};

export default defineConfig({
  base: '/tma/',
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: resolveVendorChunk,
      },
    },
  },
});
