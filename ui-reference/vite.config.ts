// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, tsconfig paths, Nitro and Lovable sandbox defaults.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      // P8 local-integration mode: browser-safe /api calls stay same-origin
      // to the reference app and are proxied to the proven NEMDAR backend.
      proxy: {
        "/api": {
          target: process.env["NEMDAR_LOCAL_BACKEND_URL"] ?? "http://127.0.0.1:3000",
          changeOrigin: true,
        },
      },
    },
  },
});
