import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Call the plugin here; it will handle 'stream', 'buffer', and other modules automatically
    nodePolyfills(),
  ],
  resolve: {
    alias: {
      // Standard project path alias
      '@': path.resolve(__dirname, './src'),
    },
  },
  // (Optional) Define global replacements if libraries expect them
  // Useful if 'global' or 'process' is reported as not defined
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
})
