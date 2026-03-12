import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  adjustmentMetricsSchema,
  adjustmentSessionDetailSchema,
  adjustmentTargetFormatSchema,
  appendAdjustmentMessageRequestSchema,
  createAdjustmentSessionRequestSchema,
  formatRuleSchema,
} from "./adjustments.js";
import {
  deleteMessageRequestSchema,
  deleteRoundRequestSchema,
  messageDeletionSchema,
  restoreMessageRequestSchema,
} from "./deletions.js";
import {
  importJobSchema,
  importListRequestSchema,
  importRequestSchema,
  importSummarySchema,
} from "./imports.js";
import { importSnapshotSchema } from "./snapshots.js";

export const contract = {
  imports: {
    list: oc
      .input(importListRequestSchema.optional())
      .output(z.array(importSummarySchema)),

    delete: oc
      .input(z.object({ id: z.string() }))
      .output(z.object({ deleted: z.boolean() })),

    create: oc.input(importRequestSchema).output(importJobSchema),

    get: oc.input(z.object({ id: z.string() })).output(importJobSchema),

    snapshot: oc
      .input(z.object({ id: z.string() }))
      .output(importSnapshotSchema),

    rawHtml: oc.input(z.object({ id: z.string() })).output(z.string()),

    exportArtifact: oc
      .input(
        z.object({
          id: z.string(),
          format: z.enum(["markdown", "handover", "json"]),
        }),
      )
      .output(z.string()),
  },

  adjustments: {
    listSessions: oc
      .input(
        z.object({
          importId: z.string(),
          format: adjustmentTargetFormatSchema.optional(),
        }),
      )
      .output(z.array(adjustmentSessionDetailSchema.shape.session)),

    createSession: oc
      .input(
        createAdjustmentSessionRequestSchema.extend({
          importId: z.string(),
        }),
      )
      .output(adjustmentSessionDetailSchema),

    getSession: oc
      .input(z.object({ id: z.string() }))
      .output(adjustmentSessionDetailSchema),

    appendMessage: oc
      .input(
        appendAdjustmentMessageRequestSchema.extend({
          sessionId: z.string(),
        }),
      )
      .output(adjustmentSessionDetailSchema),

    discard: oc
      .input(z.object({ sessionId: z.string() }))
      .output(adjustmentSessionDetailSchema),

    metrics: oc
      .input(
        z.object({
          importId: z.string(),
          format: adjustmentTargetFormatSchema,
        }),
      )
      .output(adjustmentMetricsSchema),
  },

  rules: {
    list: oc
      .input(
        z.object({
          importId: z.string(),
          format: adjustmentTargetFormatSchema.optional(),
        }),
      )
      .output(z.array(formatRuleSchema)),

    disable: oc
      .input(z.object({ id: z.string(), importId: z.string().optional() }))
      .output(formatRuleSchema),

    promote: oc.input(z.object({ id: z.string() })).output(formatRuleSchema),

    demote: oc
      .input(z.object({ id: z.string(), importId: z.string() }))
      .output(formatRuleSchema),
  },

  deletions: {
    list: oc
      .input(z.object({ importId: z.string() }))
      .output(z.array(messageDeletionSchema)),

    delete: oc.input(deleteMessageRequestSchema).output(messageDeletionSchema),

    deleteRound: oc
      .input(deleteRoundRequestSchema)
      .output(z.array(messageDeletionSchema)),

    restore: oc
      .input(restoreMessageRequestSchema)
      .output(z.object({ restored: z.boolean() })),
  },

  health: {
    check: oc.output(
      z.object({
        ok: z.boolean(),
        service: z.string(),
        databasePath: z.string(),
      }),
    ),
  },
};
