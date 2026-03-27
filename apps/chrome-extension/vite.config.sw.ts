import { defineConfig } from "vite";
import { resolve } from "path";

// Separate build for the background service worker (must be IIFE, not ESM).
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/background/service-worker.ts"),
      name: "sw",
      formats: ["iife"],
      fileName: () => "service-worker.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  publicDir: false,
});
