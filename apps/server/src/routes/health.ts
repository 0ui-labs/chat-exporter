import { Hono } from "hono";

import { databasePath } from "../lib/database.js";

export const healthRoute = new Hono().get("/", (c) =>
  c.json({
    ok: true,
    service: "chat-exporter-api",
    databasePath,
  }),
);
