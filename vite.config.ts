import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "/gitscope/",
  define: { global: "globalThis" },
  resolve: { alias: { buffer: "buffer/" } },
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "GitScope — Visual Git Workspace",
        short_name: "GitScope",
        description: "Local-first Git debugger and conflict lab",
        theme_color: "#101319",
        background_color: "#101319",
        display: "standalone",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 1800 },
});
