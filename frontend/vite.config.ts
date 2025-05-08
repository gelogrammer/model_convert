import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Get the backend URL from environment variables or use default (production) one
const backendUrl = process.env.VITE_BACKEND_URL || 'https://speech-emotion-recognition-api-t5e8.onrender.com'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: process.env.NODE_ENV === 'production' ? backendUrl : 'http://localhost:5001',
        changeOrigin: true,
        secure: true
      },
      '/socket.io': {
        target: process.env.NODE_ENV === 'production' ? backendUrl : 'http://localhost:5001',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true
  }
})
