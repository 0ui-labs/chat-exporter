import { contract, importSnapshotSchema } from "@chat-exporter/shared";
import { implement, ORPCError } from "@orpc/server";

import { databasePath, withTransaction } from "../db/client.js";
import {
  AgentUnavailableError,
  runAgentTurn,
} from "../lib/adjustment-agent.js";
import {
  appendAdjustmentMessage,
  createAdjustmentSession,
  createFormatRuleDirect,
  demoteRuleToLocal,
  disableFormatRule,
  discardAdjustmentSession,
  getAdjustmentMetrics,
  getAdjustmentSessionDetail,
  listAdjustmentSessions,
  listFormatRules,
  markSessionApplied,
  promoteRuleToProfile,
  recordAdjustmentEvent,
  reopenAdjustmentSession,
  updateFormatRuleEffect,
} from "../lib/adjustment-repository.js";
import {
  listDeletions,
  restoreMessage,
  softDeleteMessage,
  softDeleteRound,
} from "../lib/delete-repository.js";
import {
  deleteMessageEdit,
  listMessageEdits,
  saveMessageEdit,
} from "../lib/edit-repository.js";
import { getPersistedImportSnapshot } from "../lib/import-repository.js";
import {
  createImportJob,
  deleteImportJob,
  getImportJob,
  listImportJobs,
  runImportJob,
} from "../lib/import-store.js";
import {
  activateSnapshot,
  createSnapshot,
  deactivateAllSnapshots,
  deleteSnapshot,
  listSnapshots,
  renameSnapshot,
} from "../lib/snapshot-repository.js";

export const RAW_HTML_PREVIEW_LENGTH = 16_000;

function isSupportedChatGptShareLink(urlString: string) {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  return url.hostname === "chatgpt.com" && url.pathname.startsWith("/share/");
}

const os = implement(contract);

export const router = os.router({
  imports: {
    list: os.imports.list.handler(({ input }) => {
      return listImportJobs(input);
    }),

    delete: os.imports.delete.handler(({ input }) => {
      const job = getImportJob(input.id);
      if (!job) {
        throw new ORPCError("NOT_FOUND", {
          message: "Import nicht gefunden.",
        });
      }
      const deleted = deleteImportJob(input.id);
      return { deleted };
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

    // Design-Entscheidung: Dieser Endpoint liefert absichtlich rohe, unveränderte
    // Artefakte ohne angewendete Format-Rules. Client-seitiger Markdown-Download
    // verwendet stattdessen `displayedMarkdown` (mit `applyMarkdownRules` inkl.
    // format_profile-Rules). Änderungen hier dürfen diese Trennung nicht aufheben.
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

      // Phase 1 — Transaction: reopen (if needed) + append user message + reload detail
      const latestDetail = withTransaction(() => {
        const freshDetail = getAdjustmentSessionDetail(input.sessionId);

        if (!freshDetail) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Anpassungssession konnte nicht neu geladen werden.",
          });
        }

        if (freshDetail.session.status === "applied") {
          reopenAdjustmentSession(input.sessionId);
        }

        appendAdjustmentMessage(input.sessionId, "user", input.content);

        const reloaded = getAdjustmentSessionDetail(input.sessionId);

        if (!reloaded) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Anpassungssession konnte nicht neu geladen werden.",
          });
        }

        return reloaded;
      });

      const activeRules = listFormatRules(
        detail.session.importId,
        detail.session.targetFormat,
      ).filter((rule: { status: string }) => rule.status === "active");

      // Phase 2 — no wrapper: async AI call
      try {
        const job = getImportJob(detail.session.importId);
        const result = await runAgentTurn({
          sessionDetail: latestDetail,
          activeRules,
          job,
          callbacks: {
            onCreateRule: async ({ selector, effect, description }) => {
              const rule = createFormatRuleDirect({
                importId: latestDetail.session.importId,
                targetFormat: latestDetail.session.targetFormat,
                selector,
                effect: {
                  type: "custom_style" as const,
                  ...effect,
                  description,
                },
                instruction: description,
                sourceSessionId: input.sessionId,
              });
              return { ruleId: rule.id };
            },
            onUpdateRule: async ({ ruleId, effect, description }) => {
              updateFormatRuleEffect(
                ruleId,
                { type: "custom_style" as const, ...effect, description },
                description,
              );
            },
            onDeleteRule: async (ruleId) => {
              disableFormatRule(ruleId, latestDetail.session.importId);
            },
          },
        });

        // Phase 3 — persist assistant message + events
        withTransaction(() => {
          appendAdjustmentMessage(
            input.sessionId,
            "assistant",
            result.assistantMessage,
          );

          for (const action of result.actions) {
            recordAdjustmentEvent({
              importId: latestDetail.session.importId,
              ruleId: action.ruleId,
              sessionId: input.sessionId,
              targetFormat: latestDetail.session.targetFormat,
              type:
                action.type === "deleted" ? "rule_disabled" : "rule_applied",
            });
          }

          if (result.actions.length > 0) {
            markSessionApplied(input.sessionId);
          } else {
            recordAdjustmentEvent({
              importId: latestDetail.session.importId,
              sessionId: input.sessionId,
              targetFormat: latestDetail.session.targetFormat,
              type: "clarification_requested",
            });
          }
        });
      } catch (error) {
        if (error instanceof AgentUnavailableError) {
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: error.message,
          });
        }
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new ORPCError("GATEWAY_TIMEOUT", {
            message: "Die KI hat zu lange gebraucht. Bitte versuche es erneut.",
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
        return disableFormatRule(input.id, input.importId);
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

  deletions: {
    list: os.deletions.list.handler(({ input }) => {
      return listDeletions(input.importId);
    }),

    delete: os.deletions.delete.handler(({ input }) => {
      try {
        const deletion = withTransaction(() => {
          const result = softDeleteMessage(
            input.importId,
            input.messageId,
            input.reason,
          );
          recordAdjustmentEvent({
            importId: input.importId,
            targetFormat: "reader",
            type: "message_deleted",
            payload: { messageId: input.messageId },
          });
          return result;
        });
        return deletion;
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Message konnte nicht gelöscht werden.",
        });
      }
    }),

    deleteRound: os.deletions.deleteRound.handler(({ input }) => {
      try {
        const deletions = withTransaction(() => {
          const result = softDeleteRound(
            input.importId,
            input.messageId,
            input.reason,
          );
          recordAdjustmentEvent({
            importId: input.importId,
            targetFormat: "reader",
            type: "round_deleted",
            payload: { messageId: input.messageId, count: result.length },
          });
          return result;
        });
        return deletions;
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Round konnte nicht gelöscht werden.",
        });
      }
    }),

    restore: os.deletions.restore.handler(({ input }) => {
      try {
        const restored = withTransaction(() => {
          const result = restoreMessage(input.importId, input.messageId);
          if (result) {
            recordAdjustmentEvent({
              importId: input.importId,
              targetFormat: "reader",
              type: "message_restored",
              payload: { messageId: input.messageId },
            });
          }
          return result;
        });
        return { restored };
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Message konnte nicht wiederhergestellt werden.",
        });
      }
    }),
  },

  edits: {
    save: os.edits.save.handler(({ input }) => {
      const job = getImportJob(input.importId);

      if (!job) {
        throw new ORPCError("NOT_FOUND", {
          message: "Import nicht gefunden.",
        });
      }

      const record = saveMessageEdit(
        input.importId,
        input.snapshotId,
        input.messageId,
        JSON.stringify(input.editedBlocks),
        input.annotation,
      );

      return {
        id: record.id,
        importId: record.importId,
        snapshotId: record.snapshotId,
        messageId: record.messageId,
        editedBlocks: JSON.parse(record.editedBlocksJson),
        annotation: record.annotation ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    }),

    delete: os.edits.delete.handler(({ input }) => {
      const result = deleteMessageEdit(input.snapshotId, input.messageId);
      return { deleted: result };
    }),

    listForSnapshot: os.edits.listForSnapshot.handler(({ input }) => {
      const records = listMessageEdits(input.snapshotId);

      return records.map((record) => ({
        id: record.id,
        importId: record.importId,
        snapshotId: record.snapshotId,
        messageId: record.messageId,
        editedBlocks: JSON.parse(record.editedBlocksJson),
        annotation: record.annotation ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }));
    }),
  },

  snapshots: {
    list: os.snapshots.list.handler(({ input }) => {
      return listSnapshots(input.importId);
    }),

    create: os.snapshots.create.handler(({ input }) => {
      const job = getImportJob(input.importId);

      if (!job) {
        throw new ORPCError("NOT_FOUND", {
          message: "Import nicht gefunden.",
        });
      }

      return createSnapshot(input.importId, input.label);
    }),

    activate: os.snapshots.activate.handler(({ input }) => {
      return activateSnapshot(input.snapshotId);
    }),

    deactivate: os.snapshots.deactivate.handler(({ input }) => {
      deactivateAllSnapshots(input.importId);
      return { deactivated: true };
    }),

    delete: os.snapshots.delete.handler(({ input }) => {
      const result = deleteSnapshot(input.snapshotId);
      return { deleted: result };
    }),

    rename: os.snapshots.rename.handler(({ input }) => {
      return renameSnapshot(input.snapshotId, input.label);
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
