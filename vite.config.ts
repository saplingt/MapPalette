import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // 本機用 /；GitHub Actions 部署到 https://saplingt.github.io/MapPalette/
  base: process.env.GITHUB_ACTIONS ? '/MapPalette/' : '/',
  plugins: [react(), tailwindcss()],
})
