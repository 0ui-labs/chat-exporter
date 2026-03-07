import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(webRoot, "src")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787"
    }
  }
});
