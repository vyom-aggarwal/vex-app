import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Rapier's compat build embeds its WASM as base64 in the (lazy-loaded) engine chunk.
    chunkSizeWarningLimit: 5000,
  },
});
