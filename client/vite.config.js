import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    // Split the giant deps into their own chunks so first paint isn't held up
    // loading code that only certain pages use:
    //   - phaser:    only the in-game scene needs it (~1 MB)
    //   - recharts:  only the leaderboard needs it (~400 KB)
    //   - vendor:    everything else from node_modules
    // The main app chunk drops by ~70% as a result.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/phaser/'))     return 'phaser'
          if (id.includes('/recharts/') ||
              id.includes('/d3-') ||
              id.includes('/victory-')) return 'recharts'
          if (id.includes('/socket.io-client/') ||
              id.includes('/engine.io-client/')) return 'socketio'
          if (id.includes('/lucide-react/')) return 'icons'
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
