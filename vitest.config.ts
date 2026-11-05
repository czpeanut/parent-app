import { defineConfig } from 'vitest/config'
import path from 'node:path'

// npm test：tests/unit（純函式）＋ tests/integration（API route 直接呼叫，連到記憶體版假 Supabase）
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
})
