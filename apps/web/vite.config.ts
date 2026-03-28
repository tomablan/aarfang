import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    proxy: {
      // Proxy /api/oauth/* vers l'API en dev (redirections navigateur)
      '/api/oauth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
