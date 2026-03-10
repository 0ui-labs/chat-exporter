import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  adjustmentMetricsSchema,
  adjustmentSessionDetailSchema,
  adjustmentTargetFormatSchema,
  appendAdjustmentMessageRequestSchema,
  applyAdjustmentSessionResponseSchema,
  createAdjustmentSessionRequestSchema,
  formatRuleSchema,
} from "./adjustments.js";
import { importJobSchema, importRequestSchema } from "./imports.js";
import { importSnapshotSchema } from "./snapshots.js";

export const contract = {
  imports: {
    list: oc.output(z.array(importJobSchema)),

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

    generatePreview: oc
      .input(z.object({ sessionId: z.string() }))
      .output(adjustmentSessionDetailSchema),

    apply: oc
      .input(z.object({ sessionId: z.string() }))
      .output(applyAdjustmentSessionResponseSchema),

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
