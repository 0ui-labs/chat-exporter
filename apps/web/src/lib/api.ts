import {
  adjustmentMetricsSchema,
  applyAdjustmentSessionResponseSchema,
  adjustmentSessionDetailSchema,
  createAdjustmentSessionRequestSchema,
  appendAdjustmentMessageRequestSchema,
  adjustmentTargetFormatSchema,
  formatRuleSchema,
  importJobSchema,
  importRequestSchema,
  importSnapshotSchema,
  type ApplyAdjustmentSessionResponse,
  type AdjustmentSessionDetail,
  type AdjustmentMetrics,
  type AppendAdjustmentMessageRequest,
  type FormatRule,
  type CreateAdjustmentSessionRequest,
  type ImportJob,
  type ImportRequest,
  type ImportSnapshot
} from "@chat-exporter/shared";

export async function createImport(payload: ImportRequest) {
  const parsedPayload = importRequestSchema.parse(payload);

  const response = await fetch("/api/imports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(parsedPayload)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string" ? body.message : "Import konnte nicht erstellt werden.";
    throw new Error(message);
  }

  return importJobSchema.parse(await response.json());
}

export async function getImport(importId: string): Promise<ImportJob> {
  const response = await fetch(`/api/imports/${importId}`);

  if (!response.ok) {
    throw new Error("Import konnte nicht geladen werden.");
  }

  return importJobSchema.parse(await response.json());
}

export async function listImports() {
  const response = await fetch("/api/imports");

  if (!response.ok) {
    throw new Error("Importe konnten nicht geladen werden.");
  }

  const payload = (await response.json()) as unknown[];
  return payload.map((job) => importJobSchema.parse(job));
}

export async function getImportSnapshot(importId: string): Promise<ImportSnapshot> {
  const response = await fetch(`/api/imports/${importId}/snapshot`);

  if (!response.ok) {
    throw new Error("Import-Snapshot konnte nicht geladen werden.");
  }

  return importSnapshotSchema.parse(await response.json());
}

export async function createAdjustmentSession(
  importId: string,
  payload: CreateAdjustmentSessionRequest
): Promise<AdjustmentSessionDetail> {
  const parsedPayload = createAdjustmentSessionRequestSchema.parse(payload);
  const response = await fetch(`/api/imports/${importId}/adjustment-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(parsedPayload)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string"
        ? body.message
        : "Anpassungssession konnte nicht erstellt werden.";
    throw new Error(message);
  }

  return adjustmentSessionDetailSchema.parse(await response.json());
}

export async function getAdjustmentSessionDetail(
  sessionId: string
): Promise<AdjustmentSessionDetail> {
  const response = await fetch(`/api/adjustment-sessions/${sessionId}`);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string"
        ? body.message
        : "Anpassungssession konnte nicht geladen werden.";
    throw new Error(message);
  }

  return adjustmentSessionDetailSchema.parse(await response.json());
}

export async function appendAdjustmentMessage(
  sessionId: string,
  payload: AppendAdjustmentMessageRequest
): Promise<AdjustmentSessionDetail> {
  const parsedPayload = appendAdjustmentMessageRequestSchema.parse(payload);
  const response = await fetch(`/api/adjustment-sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(parsedPayload)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string"
        ? body.message
        : "Anpassungsnachricht konnte nicht gespeichert werden.";
    throw new Error(message);
  }

  return adjustmentSessionDetailSchema.parse(await response.json());
}

export async function generateAdjustmentPreview(
  sessionId: string
): Promise<AdjustmentSessionDetail> {
  const response = await fetch(`/api/adjustment-sessions/${sessionId}/preview`, {
    method: "POST"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string"
        ? body.message
        : "Anpassungsvorschau konnte nicht erzeugt werden.";
    throw new Error(message);
  }

  return adjustmentSessionDetailSchema.parse(await response.json());
}

export async function applyAdjustmentSession(
  sessionId: string
): Promise<ApplyAdjustmentSessionResponse> {
  const response = await fetch(`/api/adjustment-sessions/${sessionId}/apply`, {
    method: "POST"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string"
        ? body.message
        : "Anpassungsregel konnte nicht angewendet werden.";
    throw new Error(message);
  }

  return applyAdjustmentSessionResponseSchema.parse(await response.json());
}

export async function discardAdjustmentSession(
  sessionId: string
): Promise<AdjustmentSessionDetail> {
  const response = await fetch(`/api/adjustment-sessions/${sessionId}/discard`, {
    method: "POST"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string"
        ? body.message
        : "Anpassungssession konnte nicht verworfen werden.";
    throw new Error(message);
  }

  return adjustmentSessionDetailSchema.parse(await response.json());
}

export async function disableFormatRule(ruleId: string): Promise<FormatRule> {
  const response = await fetch(`/api/format-rules/${ruleId}/disable`, {
    method: "POST"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string" ? body.message : "Formatregel konnte nicht deaktiviert werden.";
    throw new Error(message);
  }

  return formatRuleSchema.parse(await response.json());
}

export async function getFormatRules(
  importId: string,
  targetFormat: "reader" | "markdown" | "handover" | "json"
): Promise<FormatRule[]> {
  const parsedTargetFormat = adjustmentTargetFormatSchema.parse(targetFormat);
  const response = await fetch(`/api/imports/${importId}/format-rules?format=${parsedTargetFormat}`);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string" ? body.message : "Formatregeln konnten nicht geladen werden.";
    throw new Error(message);
  }

  const payload = (await response.json()) as unknown[];
  return payload.map((rule) => formatRuleSchema.parse(rule));
}

export async function getAdjustmentMetrics(
  importId: string,
  targetFormat: "reader" | "markdown" | "handover" | "json"
): Promise<AdjustmentMetrics> {
  const parsedTargetFormat = adjustmentTargetFormatSchema.parse(targetFormat);
  const response = await fetch(
    `/api/imports/${importId}/adjustment-metrics?format=${parsedTargetFormat}`
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === "string" ? body.message : "Anpassungsmetriken konnten nicht geladen werden.";
    throw new Error(message);
  }

  return adjustmentMetricsSchema.parse(await response.json());
}
