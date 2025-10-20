import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['lib/**/*'],
      exclude: ['**/*.test.*', '**/*.spec.*'],
      tsconfigPath: './tsconfig.build.json'
    })
  ],
  build: {
    lib: {
      entry: './lib/ResourceFetcher.ts',
      name: 'ResourceFetcher',
      fileName: 'resource-fetcher',
      formats: ['es']
    }
  }
})
