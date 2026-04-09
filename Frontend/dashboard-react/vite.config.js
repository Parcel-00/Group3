
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl' //added as I needed to use https for camera access

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    https: false, // Enable HTTPS for camera access
    allowedHosts: [".trycloudflare.com"], //HTTPS MUST BE FALSE IF YOU ARE TO TUNNEL
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
