import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const devServerPort = Number(process.env.WEB_PORT ?? process.env.PORT ?? 5173);
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(webRoot, "src")
    }
  },
  server: {
    port: devServerPort,
    proxy: {
      "/api": apiProxyTarget
    }
  }
});
