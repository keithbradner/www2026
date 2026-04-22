import { defineConfig } from 'vite'
import { resolve } from 'path'
import commonjs from 'vite-plugin-commonjs'

export default defineConfig({
  base: './',
  plugins: [commonjs()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        photobooth: resolve(__dirname, 'photobooth.html'),
        gallery: resolve(__dirname, 'gallery.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  },
  test: {
    environment: 'happy-dom'
  }
})
