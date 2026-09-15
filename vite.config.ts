import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "rebuild-preview",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/pixel-flow.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/pixel-flow.[ext]",
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@xyflow")) return "vendor-canvas";
          if (id.includes("@phosphor-icons")) return "vendor-icons";
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          if (id.includes("dexie") || id.includes("zustand")) return "vendor-state";
          return "vendor";
        }
      }
    }
  }
});
