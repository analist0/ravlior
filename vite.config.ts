import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Plain Rollup + esbuild build (Vite 7). No SWC, no lightningcss, no sharp.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // Termux: open http://127.0.0.1:5173 in Chrome on the phone
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/radix-ui')) return 'radix';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('src/data/seed.json')) return 'seed';
          return undefined;
        },
      },
    },
  },
});
