import { Hono } from "hono";

import {
  adjustmentMetricsSchema,
  adjustmentSessionDetailSchema,
  adjustmentTargetFormatSchema,
  createAdjustmentSessionRequestSchema,
  formatRuleSchema,
  importRequestSchema,
  importSnapshotSchema
} from "@chat-exporter/shared";

import {
  createAdjustmentSession,
  getAdjustmentSessionDetail,
  getAdjustmentMetrics,
  listAdjustmentSessions,
  appendAdjustmentMessage,
  listFormatRules
} from "../lib/adjustment-repository.js";
import { buildInitialAdjustmentAssistantMessage } from "../lib/adjustment-assistant.js";
import {
  createImportJob,
  getImportJob,
  listImportJobs,
  runImportJob
} from "../lib/import-store.js";
import { getPersistedImportSnapshot } from "../lib/import-repository.js";

const RAW_HTML_PREVIEW_LENGTH = 16_000;

function isSupportedChatGptShareLink(urlString: string) {
  const url = new URL(urlString);
  return url.hostname === "chatgpt.com" && url.pathname.startsWith("/share/");
}

export const importsRoute = new Hono()
  .get("/", (c) => c.json(listImportJobs()))
  .post("/", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = importRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json(
        {
          message: "Invalid import request.",
          issues: parsed.error.flatten()
        },
        400
      );
    }

    if (!isSupportedChatGptShareLink(parsed.data.url)) {
      return c.json(
        {
          message:
            "This first scaffold only accepts public ChatGPT share links."
        },
        400
      );
    }

    const job = createImportJob(parsed.data);
    void runImportJob(job.id);

    return c.json(job, 202);
  })
  .get("/:id", (c) => {
    const job = getImportJob(c.req.param("id"));

    if (!job) {
      return c.json(
        {
          message: "Import job not found."
        },
        404
      );
    }

    return c.json(job);
  })
  .get("/:id/adjustment-sessions", (c) => {
    const importId = c.req.param("id");
    const job = getImportJob(importId);

    if (!job) {
      return c.json(
        {
          message: "Import job not found."
        },
        404
      );
    }

    const formatQuery = c.req.query("format");
    const parsedFormat = formatQuery
      ? adjustmentTargetFormatSchema.safeParse(formatQuery)
      : null;

    if (parsedFormat && !parsedFormat.success) {
      return c.json(
        {
          message: "Unsupported adjustment format.",
          issues: parsedFormat.error.flatten()
        },
        400
      );
    }

    return c.json(listAdjustmentSessions(importId, parsedFormat?.data));
  })
  .post("/:id/adjustment-sessions", async (c) => {
    const importId = c.req.param("id");
    const job = getImportJob(importId);

    if (!job) {
      return c.json(
        {
          message: "Import job not found."
        },
        404
      );
    }

    const payload = await c.req.json().catch(() => null);
    const parsed = createAdjustmentSessionRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json(
        {
          message: "Invalid adjustment session request.",
          issues: parsed.error.flatten()
        },
        400
      );
    }

    const session = createAdjustmentSession({
      importId,
      selection: parsed.data.selection,
      targetFormat: parsed.data.targetFormat
    });
    appendAdjustmentMessage(
      session.id,
      "assistant",
      buildInitialAdjustmentAssistantMessage(session)
    );
    const detail = getAdjustmentSessionDetail(session.id);

    if (!detail) {
      return c.json(
        {
          message: "Adjustment session could not be loaded."
        },
        500
      );
    }

    return c.json(adjustmentSessionDetailSchema.parse(detail), 201);
  })
  .get("/:id/format-rules", (c) => {
    const importId = c.req.param("id");
    const job = getImportJob(importId);

    if (!job) {
      return c.json(
        {
          message: "Import job not found."
        },
        404
      );
    }

    const formatQuery = c.req.query("format");
    const parsedFormat = formatQuery
      ? adjustmentTargetFormatSchema.safeParse(formatQuery)
      : null;

    if (parsedFormat && !parsedFormat.success) {
      return c.json(
        {
          message: "Unsupported format rule target.",
          issues: parsedFormat.error.flatten()
        },
        400
      );
    }

    return c.json(listFormatRules(importId, parsedFormat?.data).map((rule) => formatRuleSchema.parse(rule)));
  })
  .get("/:id/adjustment-metrics", (c) => {
    const importId = c.req.param("id");
    const job = getImportJob(importId);

    if (!job) {
      return c.json(
        {
          message: "Import job not found."
        },
        404
      );
    }

    const formatQuery = c.req.query("format");
    const parsedFormat = adjustmentTargetFormatSchema.safeParse(formatQuery);

    if (!parsedFormat.success) {
      return c.json(
        {
          message: "Unsupported adjustment metrics target.",
          issues: parsedFormat.error.flatten()
        },
        400
      );
    }

    return c.json(adjustmentMetricsSchema.parse(getAdjustmentMetrics(importId, parsedFormat.data)));
  })
  .get("/:id/snapshot", (c) => {
    const snapshot = getPersistedImportSnapshot(c.req.param("id"));

    if (!snapshot) {
      return c.json(
        {
          message: "Import snapshot not found."
        },
        404
      );
    }

    const rawHtmlPreview = snapshot.rawHtml.slice(0, RAW_HTML_PREVIEW_LENGTH);

    return c.json(
      importSnapshotSchema.parse({
        importId: snapshot.importId,
        sourceUrl: snapshot.sourceUrl,
        finalUrl: snapshot.finalUrl,
        fetchedAt: snapshot.fetchedAt,
        pageTitle: snapshot.pageTitle,
        rawHtmlBytes: Buffer.byteLength(snapshot.rawHtml, "utf8"),
        rawHtmlPreview,
        rawHtmlTruncated: snapshot.rawHtml.length > rawHtmlPreview.length,
        normalizedPayload: snapshot.normalizedPayload,
        fetchMetadata: snapshot.fetchMetadata
      })
    );
  })
  .get("/:id/snapshot/raw-html", (c) => {
    const snapshot = getPersistedImportSnapshot(c.req.param("id"));

    if (!snapshot) {
      return c.json(
        {
          message: "Import snapshot not found."
        },
        404
      );
    }

    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body(snapshot.rawHtml);
  })
  .get("/:id/export/:format", (c) => {
    const job = getImportJob(c.req.param("id"));

    if (!job || !job.artifacts) {
      return c.json(
        {
          message: "Export artifact not found."
        },
        404
      );
    }

    const format = c.req.param("format");

    switch (format) {
      case "markdown":
        c.header("Content-Type", "text/markdown; charset=utf-8");
        return c.body(job.artifacts.markdown);
      case "handover":
        c.header("Content-Type", "text/plain; charset=utf-8");
        return c.body(job.artifacts.handover);
      case "json":
        c.header("Content-Type", "application/json; charset=utf-8");
        return c.body(job.artifacts.json);
      default:
        return c.json(
          {
            message: "Unsupported export format."
          },
          400
        );
    }
  });
