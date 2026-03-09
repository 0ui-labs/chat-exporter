import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";

import { adjustmentSessionsRoute } from "./routes/adjustment-sessions.js";
import { formatRulesRoute } from "./routes/format-rules.js";
import { healthRoute } from "./routes/health.js";
import { importsRoute } from "./routes/imports.js";
import { router } from "./rpc/router.js";

export const app = new Hono();

const rpcHandler = new RPCHandler(router);

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {},
  });
  if (matched) {
    return c.newResponse(response.body, response);
  }
  await next();
});

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
