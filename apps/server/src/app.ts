import { Hono } from "hono";

import { healthRoute } from "./routes/health.js";
import { importsRoute } from "./routes/imports.js";

export const app = new Hono();

app.route("/api/health", healthRoute);
app.route("/api/imports", importsRoute);

app.get("/", (c) =>
  c.json({
    name: "chat-exporter-api",
    status: "ok"
  })
);
