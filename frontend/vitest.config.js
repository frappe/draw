import { defineConfig } from 'vitest/config'
import path from 'path'

// Pure JS unit tests for diagram-domain logic (geometry, model, layout, schema).
// Node environment — no DOM needed (CONVENTIONS: keep domain logic browser-free).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
