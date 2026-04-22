import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      'process.env.S3_BUCKET': JSON.stringify(env.S3_BUCKET || ''),
      'process.env.AWS_REGION': JSON.stringify(env.AWS_REGION || ''),
    },
    server: {
      proxy: {
        '/api': {
          target: env.API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
