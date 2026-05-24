import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const resolvedHost = host || "127.0.0.1";

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-xterm": ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-search"],
          "vendor-markdown": ["react-markdown"],
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-select",
            "@radix-ui/react-switch",
            "@radix-ui/react-slider",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-label",
            "@radix-ui/react-slot",
            "@radix-ui/react-alert-dialog",
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.tsx",
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: resolvedHost,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
