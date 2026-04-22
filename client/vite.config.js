import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    define: {
      'process.env.API_BASE_URL': JSON.stringify(process.env.API_BASE_URL || ''),
      'process.env.S3_BUCKET': JSON.stringify(process.env.S3_BUCKET || ''),
      'process.env.AWS_REGION': JSON.stringify(process.env.AWS_REGION || ''),
    },
  }
})
