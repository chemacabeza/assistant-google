import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/oauth2': { // Needed for the redirect dance
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/login': {  // Spring security defaults
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },
  // Vitest (unit/component tests). Test files are never imported by the app, so they are
  // not part of the production bundle.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{js,jsx}', 'src/main.jsx'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
