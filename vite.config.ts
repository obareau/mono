import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  server: { open: true },
  plugins: [
    VitePWA({
      // Emergency: ship a self-destroying service worker so every client unregisters the old
      // SW and purges its stale precache on next load (the cause of seeing an old build).
      selfDestroying: true,
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "MONO° — 1-bit image workbench",
        short_name: "MONO°",
        description: "Industrial 1-bit black & white image workbench — halftone, dithering, screens, vector export.",
        theme_color: "#0a0a0a",
        background_color: "#dcdcdc",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
