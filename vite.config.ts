import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { builtinLibraryPlugin } from "./scripts/builtin-vite";
export default defineConfig({
  plugins: [react(), builtinLibraryPlugin(), {
    name: 'exclude-server-generators', apply: 'build',
    generateBundle() {
      for (const id of this.getModuleIds()) if (id.replaceAll('\\', '/').includes('/server/api/src/'))
        this.error('服务端源码不能进入桌面前端产物');
    },
  }],
  publicDir: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**', '**/.private/**', '**/backups/**'] },
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/editor-plugin/target/**",
        "**/.tools/**",
        "**/.private/**",
        "**/release/**",
        "**/素材/**",
      ],
    },
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks: { canvas: ["konva", "react-konva"], schema: ["zod"] },
      },
    },
  },
});
