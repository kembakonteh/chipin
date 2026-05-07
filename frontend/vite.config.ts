import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'offline.html'],
      manifest: {
        name: 'ChipIn',
        short_name: 'ChipIn',
        description: 'Group payments made simple',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f1117',
        theme_color: '#0f1117',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
        suppressWarnings: true,
      },
    }),
  ],
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
