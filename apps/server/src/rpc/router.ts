import { contract, importSnapshotSchema } from "@chat-exporter/shared";
import { implement, ORPCError } from "@orpc/server";

import { databasePath } from "../db/client.js";
import {
  AdjustmentChatUnavailableError,
  type ApplyAdjustmentRuleResult,
  runAdjustmentChatTurn,
} from "../lib/adjustment-chat-orchestrator.js";
import { buildAdjustmentPreview } from "../lib/adjustment-preview.js";
import {
  appendAdjustmentMessage,
  applyAdjustmentPreview,
  createAdjustmentSession,
  demoteRuleToLocal,
  disableFormatRule,
  discardAdjustmentSession,
  getAdjustmentMetrics,
  getAdjustmentSessionDetail,
  listAdjustmentSessions,
  listFormatRules,
  promoteRuleToProfile,
  recordAdjustmentEvent,
  reopenAdjustmentSession,
  saveAdjustmentPreview,
} from "../lib/adjustment-repository.js";
import { getPersistedImportSnapshot } from "../lib/import-repository.js";
import {
  createImportJob,
  getImportJob,
  listImportJobs,
  runImportJob,
} from "../lib/import-store.js";

const RAW_HTML_PREVIEW_LENGTH = 16_000;

function isSupportedChatGptShareLink(urlString: string) {
  const url = new URL(urlString);
  return url.hostname === "chatgpt.com" && url.pathname.startsWith("/share/");
}

const os = implement(contract);

export const router = os.router({
  imports: {
    list: os.imports.list.handler(() => {
      return listImportJobs();
    }),

    create: os.imports.create.handler(({ input }) => {
      if (!isSupportedChatGptShareLink(input.url)) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Dieser erste Stand akzeptiert nur öffentliche ChatGPT-Share-Links.",
        });
      }

      const job = createImportJob(input);
      void runImportJob(job.id);
      return job;
    }),

    get: os.imports.get.handler(({ input }) => {
      const job = getImportJob(input.id);

      if (!job) {
        throw new ORPCError("NOT_FOUND", {
          message: "Import nicht gefunden.",
        });
      }

      return job;
    }),

    snapshot: os.imports.snapshot.handler(({ input }) => {
      const snapshot = getPersistedImportSnapshot(input.id);

      if (!snapshot) {
        throw new ORPCError("NOT_FOUND", {
          message: "Import-Snapshot nicht gefunden.",
        });
      }

      const rawHtmlPreview = snapshot.rawHtml.slice(0, RAW_HTML_PREVIEW_LENGTH);

      return importSnapshotSchema.parse({
        importId: snapshot.importId,
        sourceUrl: snapshot.sourceUrl,
        finalUrl: snapshot.finalUrl,
        fetchedAt: snapshot.fetchedAt,
        pageTitle: snapshot.pageTitle,
        rawHtmlBytes: Buffer.byteLength(snapshot.rawHtml, "utf8"),
        rawHtmlPreview,
        rawHtmlTruncated: snapshot.rawHtml.length > rawHtmlPreview.length,
        normalizedPayload: snapshot.normalizedPayload,
        fetchMetadata: snapshot.fetchMetadata,
      });
    }),

    rawHtml: os.imports.rawHtml.handler(({ input }) => {
      const snapshot = getPersistedImportSnapshot(input.id);

      if (!snapshot) {
        throw new ORPCError("NOT_FOUND", {
          message: "Import-Snapshot nicht gefunden.",
        });
      }

      return snapshot.rawHtml;
    }),

    exportArtifact: os.imports.exportArtifact.handler(({ input }) => {
      const job = getImportJob(input.id);

      if (!job || !job.artifacts) {
        throw new ORPCError("NOT_FOUND", {
          message: "Export-Artefakt nicht gefunden.",
        });
      }

      switch (input.format) {
        case "markdown":
          return job.artifacts.markdown;
        case "handover":
          return job.artifacts.handover;
        case "json":
          return job.artifacts.json;
        default:
          throw new ORPCError("BAD_REQUEST", {
            message: "Nicht unterstütztes Exportformat.",
          });
      }
    }),
  },

  adjustments: {
    listSessions: os.adjustments.listSessions.handler(({ input }) => {
      const job = getImportJob(input.importId);

      if (!job) {
        throw new ORPCError("NOT_FOUND", {
          message: "Import nicht gefunden.",
        });
      }

      return listAdjustmentSessions(input.importId, input.format);
    }),

    createSession: os.adjustments.createSession.handler(({ input }) => {
      const job = getImportJob(input.importId);

      if (!job) {
        throw new ORPCError("NOT_FOUND", {
          message: "Import nicht gefunden.",
        });
      }

      const { session } = createAdjustmentSession({
        importId: input.importId,
        selection: input.selection,
        targetFormat: input.targetFormat,
      });
      const detail = getAdjustmentSessionDetail(session.id);

      if (!detail) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Anpassungssession konnte nicht geladen werden.",
        });
      }

      return detail;
    }),

    getSession: os.adjustments.getSession.handler(({ input }) => {
      const detail = getAdjustmentSessionDetail(input.id);

      if (!detail) {
        throw new ORPCError("NOT_FOUND", {
          message: "Anpassungssession nicht gefunden.",
        });
      }

      return detail;
    }),

    appendMessage: os.adjustments.appendMessage.handler(async ({ input }) => {
      const detail = getAdjustmentSessionDetail(input.sessionId);

      if (!detail) {
        throw new ORPCError("NOT_FOUND", {
          message: "Anpassungssession nicht gefunden.",
        });
      }

      appendAdjustmentMessage(input.sessionId, "user", input.content);
      let latestDetail = getAdjustmentSessionDetail(input.sessionId);

      if (!latestDetail) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Anpassungssession konnte nicht neu geladen werden.",
        });
      }

      if (latestDetail.session.status === "applied") {
        reopenAdjustmentSession(input.sessionId);
        const refreshedDetail = getAdjustmentSessionDetail(input.sessionId);

        if (!refreshedDetail) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Anpassungssession konnte nicht neu geladen werden.",
          });
        }

        latestDetail = refreshedDetail;
      }

      const activeRules = listFormatRules(
        detail.session.importId,
        detail.session.targetFormat,
      ).filter((rule: { status: string }) => rule.status === "active");

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
                  id: `${input.sessionId}:tool-instruction`,
                  role: "user" as const,
                  sessionId: input.sessionId,
                },
              ],
            };

            try {
              const preview = await buildAdjustmentPreview({
                activeRules,
                job,
                sessionDetail: syntheticDetail,
              });

              saveAdjustmentPreview(input.sessionId, preview);
              recordAdjustmentEvent({
                importId: latestDetail.session.importId,
                sessionId: input.sessionId,
                targetFormat: latestDetail.session.targetFormat,
                type: "preview_generated",
              });

              const applied = applyAdjustmentPreview(input.sessionId);

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
                payload: { message },
                sessionId: input.sessionId,
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
          appendAdjustmentMessage(input.sessionId, "tool", toolMessage);
        }

        appendAdjustmentMessage(
          input.sessionId,
          "assistant",
          chatTurn.assistantMessage,
        );

        if (chatTurn.didRequestClarification) {
          recordAdjustmentEvent({
            importId: latestDetail.session.importId,
            sessionId: input.sessionId,
            targetFormat: latestDetail.session.targetFormat,
            type: "clarification_requested",
          });
        }
      } catch (error) {
        if (error instanceof AdjustmentChatUnavailableError) {
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: error.message,
          });
        }
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Die Live-KI-Nachricht konnte nicht verarbeitet werden.",
        });
      }

      const nextDetail = getAdjustmentSessionDetail(input.sessionId);

      if (!nextDetail) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Anpassungssession konnte nicht neu geladen werden.",
        });
      }

      return nextDetail;
    }),

    generatePreview: os.adjustments.generatePreview.handler(
      async ({ input }) => {
        const detail = getAdjustmentSessionDetail(input.sessionId);

        if (!detail) {
          throw new ORPCError("NOT_FOUND", {
            message: "Anpassungssession nicht gefunden.",
          });
        }

        try {
          const job = getImportJob(detail.session.importId);
          const activeRules = listFormatRules(
            detail.session.importId,
            detail.session.targetFormat,
          ).filter((rule: { status: string }) => rule.status === "active");
          const preview = await buildAdjustmentPreview({
            activeRules,
            job,
            sessionDetail: detail,
          });
          saveAdjustmentPreview(input.sessionId, preview);
          recordAdjustmentEvent({
            importId: detail.session.importId,
            sessionId: input.sessionId,
            targetFormat: detail.session.targetFormat,
            type: "preview_generated",
          });

          const nextDetail = getAdjustmentSessionDetail(input.sessionId);

          if (!nextDetail) {
            throw new ORPCError("INTERNAL_SERVER_ERROR", {
              message: "Anpassungssession konnte nicht neu geladen werden.",
            });
          }

          return nextDetail;
        } catch (error) {
          if (error instanceof ORPCError) {
            throw error;
          }

          recordAdjustmentEvent({
            importId: detail.session.importId,
            payload: {
              message:
                error instanceof Error
                  ? error.message
                  : "Anpassungsvorschau konnte nicht erzeugt werden.",
            },
            sessionId: input.sessionId,
            targetFormat: detail.session.targetFormat,
            type: "preview_failed",
          });

          throw new ORPCError("BAD_REQUEST", {
            message:
              error instanceof Error
                ? error.message
                : "Anpassungsvorschau konnte nicht erzeugt werden.",
          });
        }
      },
    ),

    apply: os.adjustments.apply.handler(({ input }) => {
      try {
        return applyAdjustmentPreview(input.sessionId);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Anpassungsregel konnte nicht angewendet werden.",
        });
      }
    }),

    discard: os.adjustments.discard.handler(({ input }) => {
      try {
        return discardAdjustmentSession(input.sessionId);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Anpassungssession konnte nicht verworfen werden.",
        });
      }
    }),

    metrics: os.adjustments.metrics.handler(({ input }) => {
      return getAdjustmentMetrics(input.importId, input.format);
    }),
  },

  rules: {
    list: os.rules.list.handler(({ input }) => {
      return listFormatRules(input.importId, input.format);
    }),

    disable: os.rules.disable.handler(({ input }) => {
      try {
        return disableFormatRule(input.id);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Formatregel konnte nicht deaktiviert werden.",
        });
      }
    }),

    promote: os.rules.promote.handler(({ input }) => {
      try {
        return promoteRuleToProfile(input.id);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Formatregel konnte nicht zum Profil befördert werden.",
        });
      }
    }),

    demote: os.rules.demote.handler(({ input }) => {
      try {
        return demoteRuleToLocal(input.id, input.importId);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Formatregel konnte nicht zurückgestuft werden.",
        });
      }
    }),
  },

  health: {
    check: os.health.check.handler(() => {
      return {
        ok: true as const,
        service: "chat-exporter-api",
        databasePath,
      };
    }),
  },
});
