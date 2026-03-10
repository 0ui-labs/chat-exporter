import "./load-env.js";

import { serve } from "@hono/node-server";

import { app } from "./app.js";
import { shutdownPool } from "./lib/browser-pool.js";

export async function handleShutdown(): Promise<void> {
  await shutdownPool();
  process.exit(0);
}

const port = Number(process.env.PORT ?? 8787);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`chat-exporter-api listening on http://localhost:${info.port}`);
  },
);

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);
