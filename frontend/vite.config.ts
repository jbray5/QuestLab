import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // Plan 128 — files the local API stores (battle maps, portraits) come back as
      // "/uploads/…" URLs; without this the dev server answered with the app's HTML
      // and every uploaded map showed a broken image (Marco). In production maps
      // are absolute Vercel Blob URLs and don't pass through here.
      "/uploads": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
