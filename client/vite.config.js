import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_PROXY_TARGET = process.env.API_BASE_URL || 'http://3.36.38.216:9000'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: API_PROXY_TARGET,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    define: {
      'process.env.S3_BUCKET': JSON.stringify(process.env.S3_BUCKET || ''),
      'process.env.AWS_REGION': JSON.stringify(process.env.AWS_REGION || ''),
    },
  }
})
