import { Hono } from "hono";

import {
  adjustmentSessionDetailSchema,
  appendAdjustmentMessageRequestSchema
} from "@chat-exporter/shared";

import {
  appendAdjustmentMessage,
  getAdjustmentSessionDetail
} from "../lib/adjustment-repository.js";

export const adjustmentSessionsRoute = new Hono()
  .get("/:id", (c) => {
    const detail = getAdjustmentSessionDetail(c.req.param("id"));

    if (!detail) {
      return c.json(
        {
          message: "Adjustment session not found."
        },
        404
      );
    }

    return c.json(adjustmentSessionDetailSchema.parse(detail));
  })
  .post("/:id/messages", async (c) => {
    const sessionId = c.req.param("id");
    const detail = getAdjustmentSessionDetail(sessionId);

    if (!detail) {
      return c.json(
        {
          message: "Adjustment session not found."
        },
        404
      );
    }

    const payload = await c.req.json().catch(() => null);
    const parsed = appendAdjustmentMessageRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json(
        {
          message: "Invalid adjustment message.",
          issues: parsed.error.flatten()
        },
        400
      );
    }

    appendAdjustmentMessage(sessionId, parsed.data.content);
    const nextDetail = getAdjustmentSessionDetail(sessionId);

    if (!nextDetail) {
      return c.json(
        {
          message: "Adjustment session could not be reloaded."
        },
        500
      );
    }

    return c.json(adjustmentSessionDetailSchema.parse(nextDetail), 201);
  });
