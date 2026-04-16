import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dts({ tsconfigPath: './tsconfig.json', rollupTypes: true }),
  ],
  worker: {
    format: 'es',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: (id) =>
        /^react($|\/)/.test(id) ||
        /^react-dom($|\/)/.test(id) ||
        /^three($|\/)/.test(id) ||
        /^@react-three\//.test(id),
      output: {
        assetFileNames: (info) => {
          if (info.name === 'style.css') return 'styles.css'
          return info.name ?? 'assets/[name]-[hash][extname]'
        },
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
    minify: 'esbuild',
  },
})
