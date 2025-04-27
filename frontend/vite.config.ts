import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://10.0.0.44:5001',
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://10.0.0.44:5001',
        ws: true
      }
    }
  }
})
