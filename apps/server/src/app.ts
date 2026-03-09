import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";

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

app.get("/", (c) =>
  c.json({
    name: "chat-exporter-api",
    status: "ok",
  }),
);
