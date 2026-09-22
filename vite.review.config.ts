// REVIEW-ONLY build config: inlines the entire app into a single dist/index.html
// so it can be hosted on a plain static file host for review sessions.
// Not used for normal dev/prod builds. Safe to delete.
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    // singlefile sets inlineDynamicImports + inlines all assets; keep chunk
    // warnings quiet since everything lands in one file by design.
    chunkSizeWarningLimit: 5000,
  },
})
