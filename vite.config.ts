import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        /**
         * Deliberately does NOT name a chunk for three.js.
         *
         * three is only reachable through the dynamic `import('./scene')` in
         * `src/components/three/index.tsx`, so Rollup already isolates it into
         * a lazily-fetched chunk. Forcing it into a *manual* chunk actively
         * broke that: Rollup parked Vite's shared `preload-helper` module in
         * the same chunk, which made the entry statically import it, which made
         * Vite emit a `<link rel="modulepreload">` for the whole 800KB+ of
         * WebGL on first paint. Leaving it to Rollup keeps 3D genuinely lazy.
         *
         * react and framer-motion are named because they ARE static deps of the
         * entry — splitting them out just gives them a stable, cacheable URL.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) return 'motion'
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
              id,
            )
          ) {
            return 'react'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    // The functions in api/ run in a small local server (scripts/dev-api.ts).
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT ?? 3110}`,
    },
  },
})
