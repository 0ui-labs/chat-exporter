import {
  adjustmentSessionDetailSchema,
  appendAdjustmentMessageRequestSchema,
  applyAdjustmentSessionResponseSchema,
} from "@chat-exporter/shared";
import { Hono } from "hono";

import {
  AdjustmentChatUnavailableError,
  type ApplyAdjustmentRuleResult,
  runAdjustmentChatTurn,
} from "../lib/adjustment-chat-orchestrator.js";
import { buildAdjustmentPreview } from "../lib/adjustment-preview.js";
import {
  appendAdjustmentMessage,
  applyAdjustmentPreview,
  discardAdjustmentSession,
  getAdjustmentSessionDetail,
  listFormatRules,
  recordAdjustmentEvent,
  reopenAdjustmentSession,
  saveAdjustmentPreview,
} from "../lib/adjustment-repository.js";
import { getImportJob } from "../lib/import-store.js";

export const adjustmentSessionsRoute = new Hono()
  .get("/:id", (c) => {
    const detail = getAdjustmentSessionDetail(c.req.param("id"));

    if (!detail) {
      return c.json(
        {
          message: "Anpassungssession nicht gefunden.",
        },
        404,
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
          message: "Anpassungssession nicht gefunden.",
        },
        404,
      );
    }

    const payload = await c.req.json().catch(() => null);
    const parsed = appendAdjustmentMessageRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json(
        {
          message: "Ungültige Anpassungsnachricht.",
          issues: parsed.error.flatten(),
        },
        400,
      );
    }

    appendAdjustmentMessage(sessionId, "user", parsed.data.content);
    let latestDetail = getAdjustmentSessionDetail(sessionId);

    if (!latestDetail) {
      return c.json(
        {
          message: "Anpassungssession konnte nicht neu geladen werden.",
        },
        500,
      );
    }

    if (latestDetail.session.status === "applied") {
      reopenAdjustmentSession(sessionId);
      const refreshedDetail = getAdjustmentSessionDetail(sessionId);

      if (!refreshedDetail) {
        return c.json(
          {
            message: "Anpassungssession konnte nicht neu geladen werden.",
          },
          500,
        );
      }

      latestDetail = refreshedDetail;
    }

    const activeRules = listFormatRules(
      detail.session.importId,
      detail.session.targetFormat,
    ).filter((rule) => rule.status === "active");

    try {
      const job = getImportJob(detail.session.importId);
      const chatTurn = await runAdjustmentChatTurn({
        activeRules,
        executeApplyAdjustmentRule: async ({ instruction }) => {
          const syntheticDetail = {
            ...latestDetail,
            messages: [
              ...latestDetail.messages,
              {
                content: instruction,
                createdAt: new Date().toISOString(),
                id: `${sessionId}:tool-instruction`,
                role: "user" as const,
                sessionId,
              },
            ],
          };

          try {
            const preview = await buildAdjustmentPreview({
              activeRules,
              job,
              sessionDetail: syntheticDetail,
            });

            saveAdjustmentPreview(sessionId, preview);
            recordAdjustmentEvent({
              importId: latestDetail.session.importId,
              sessionId,
              targetFormat: latestDetail.session.targetFormat,
              type: "preview_generated",
            });

            const applied = applyAdjustmentPreview(sessionId);

            return {
              ok: true,
              rationale: preview.rationale,
              ruleId: applied.rule.id,
              summary: preview.summary,
            } satisfies ApplyAdjustmentRuleResult;
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Die Regel konnte nicht direkt angewendet werden.";

            recordAdjustmentEvent({
              importId: latestDetail.session.importId,
              payload: {
                message,
              },
              sessionId,
              targetFormat: latestDetail.session.targetFormat,
              type: "preview_failed",
            });

            return {
              error: message,
              ok: false,
            } satisfies ApplyAdjustmentRuleResult;
          }
        },
        job,
        sessionDetail: latestDetail,
      });

      for (const toolMessage of chatTurn.toolMessages) {
        appendAdjustmentMessage(sessionId, "tool", toolMessage);
      }

      appendAdjustmentMessage(
        sessionId,
        "assistant",
        chatTurn.assistantMessage,
      );

      if (chatTurn.didRequestClarification) {
        recordAdjustmentEvent({
          importId: latestDetail.session.importId,
          sessionId,
          targetFormat: latestDetail.session.targetFormat,
          type: "clarification_requested",
        });
      }
    } catch (error) {
      return c.json(
        {
          message:
            error instanceof AdjustmentChatUnavailableError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Die Live-KI-Nachricht konnte nicht verarbeitet werden.",
        },
        error instanceof AdjustmentChatUnavailableError ? 503 : 400,
      );
    }

    const nextDetail = getAdjustmentSessionDetail(sessionId);

    if (!nextDetail) {
      return c.json(
        {
          message: "Anpassungssession konnte nicht neu geladen werden.",
        },
        500,
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
          message: "Anpassungssession nicht gefunden.",
        },
        404,
      );
    }

    try {
      const job = getImportJob(detail.session.importId);
      const activeRules = listFormatRules(
        detail.session.importId,
        detail.session.targetFormat,
      ).filter((rule) => rule.status === "active");
      const preview = await buildAdjustmentPreview({
        activeRules,
        job,
        sessionDetail: detail,
      });
      saveAdjustmentPreview(sessionId, preview);
      recordAdjustmentEvent({
        importId: detail.session.importId,
        sessionId,
        targetFormat: detail.session.targetFormat,
        type: "preview_generated",
      });
      const nextDetail = getAdjustmentSessionDetail(sessionId);

      if (!nextDetail) {
        return c.json(
          {
            message: "Anpassungssession konnte nicht neu geladen werden.",
          },
          500,
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
              : "Anpassungsvorschau konnte nicht erzeugt werden.",
        },
        sessionId,
        targetFormat: detail.session.targetFormat,
        type: "preview_failed",
      });
      return c.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "Anpassungsvorschau konnte nicht erzeugt werden.",
        },
        400,
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
              : "Anpassungsregel konnte nicht angewendet werden.",
        },
        400,
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
              : "Anpassungssession konnte nicht verworfen werden.",
        },
        400,
      );
    }
  });
