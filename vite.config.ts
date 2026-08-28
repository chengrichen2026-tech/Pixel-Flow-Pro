import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "rebuild-preview",
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "assets/pixel-flow.js", assetFileNames: "assets/pixel-flow.[ext]" } }
  }
});
