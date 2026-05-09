import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    proxy: {
      '/api': {
        target: process.env.API_BASE_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    define: {
      'process.env.S3_BUCKET': JSON.stringify(process.env.S3_BUCKET || ''),
      'process.env.AWS_REGION': JSON.stringify(process.env.AWS_REGION || ''),
    },
  }
})
