import { Hono } from "hono";

import { adjustmentSessionsRoute } from "./routes/adjustment-sessions.js";
import { formatRulesRoute } from "./routes/format-rules.js";
import { healthRoute } from "./routes/health.js";
import { importsRoute } from "./routes/imports.js";

export const app = new Hono();

app.route("/api/format-rules", formatRulesRoute);
app.route("/api/adjustment-sessions", adjustmentSessionsRoute);
app.route("/api/health", healthRoute);
app.route("/api/imports", importsRoute);

app.get("/", (c) =>
  c.json({
    name: "chat-exporter-api",
    status: "ok",
  }),
);
