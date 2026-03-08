import { Hono } from "hono";

import {
  applyAdjustmentSessionResponseSchema,
  adjustmentSessionDetailSchema,
  appendAdjustmentMessageRequestSchema
} from "@chat-exporter/shared";

import { buildAdjustmentAssistantReply } from "../lib/adjustment-assistant.js";
import { buildAdjustmentPreview } from "../lib/adjustment-preview.js";
import {
  applyAdjustmentPreview,
  appendAdjustmentMessage,
  discardAdjustmentSession,
  getAdjustmentSessionDetail,
  listFormatRules,
  recordAdjustmentEvent,
  saveAdjustmentPreview
} from "../lib/adjustment-repository.js";
import { getImportJob } from "../lib/import-store.js";

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

    appendAdjustmentMessage(sessionId, "user", parsed.data.content);
    appendAdjustmentMessage(
      sessionId,
      "assistant",
      buildAdjustmentAssistantReply({
        selection: detail.session.selection,
        targetFormat: detail.session.targetFormat,
        userMessage: parsed.data.content
      })
    );
    recordAdjustmentEvent({
      importId: detail.session.importId,
      sessionId,
      targetFormat: detail.session.targetFormat,
      type: "clarification_requested"
    });
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
  })
  .post("/:id/preview", async (c) => {
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

    try {
      const job = getImportJob(detail.session.importId);
      const activeRules = listFormatRules(detail.session.importId, detail.session.targetFormat).filter(
        (rule) => rule.status === "active"
      );
      const preview = await buildAdjustmentPreview({
        activeRules,
        job,
        sessionDetail: detail
      });
      saveAdjustmentPreview(sessionId, preview);
      recordAdjustmentEvent({
        importId: detail.session.importId,
        sessionId,
        targetFormat: detail.session.targetFormat,
        type: "preview_generated"
      });
      const nextDetail = getAdjustmentSessionDetail(sessionId);

      if (!nextDetail) {
        return c.json(
          {
            message: "Adjustment session could not be reloaded."
          },
          500
        );
      }

      return c.json(adjustmentSessionDetailSchema.parse(nextDetail));
    } catch (error) {
      recordAdjustmentEvent({
        importId: detail.session.importId,
        payload: {
          message:
            error instanceof Error
              ? error.message
              : "Adjustment preview could not be generated."
        },
        sessionId,
        targetFormat: detail.session.targetFormat,
        type: "preview_failed"
      });
      return c.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "Adjustment preview could not be generated."
        },
        400
      );
    }
  })
  .post("/:id/apply", (c) => {
    const sessionId = c.req.param("id");

    try {
      const result = applyAdjustmentPreview(sessionId);
      return c.json(applyAdjustmentSessionResponseSchema.parse(result), 201);
    } catch (error) {
      return c.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "Adjustment rule could not be applied."
        },
        400
      );
    }
  })
  .post("/:id/discard", (c) => {
    const sessionId = c.req.param("id");

    try {
      const detail = discardAdjustmentSession(sessionId);
      return c.json(adjustmentSessionDetailSchema.parse(detail));
    } catch (error) {
      return c.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "Adjustment session could not be discarded."
        },
        400
      );
    }
  });
