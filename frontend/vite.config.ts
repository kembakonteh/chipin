import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['chipin.kafotech.io'],
    proxy: {
      '/api': {
        target: 'http://chipin-backend:8000',
        changeOrigin: true,
      },
    },
  },
})
