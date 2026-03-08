import {
  adjustmentSessionDetailSchema,
  createAdjustmentSessionRequestSchema,
  appendAdjustmentMessageRequestSchema,
  importJobSchema,
  importRequestSchema,
  importSnapshotSchema,
  type AdjustmentSessionDetail,
  type AppendAdjustmentMessageRequest,
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
      typeof body?.message === "string" ? body.message : "Import could not be created.";
    throw new Error(message);
  }

  return importJobSchema.parse(await response.json());
}

export async function getImport(importId: string): Promise<ImportJob> {
  const response = await fetch(`/api/imports/${importId}`);

  if (!response.ok) {
    throw new Error("Import job could not be loaded.");
  }

  return importJobSchema.parse(await response.json());
}

export async function listImports() {
  const response = await fetch("/api/imports");

  if (!response.ok) {
    throw new Error("Imports could not be loaded.");
  }

  const payload = (await response.json()) as unknown[];
  return payload.map((job) => importJobSchema.parse(job));
}

export async function getImportSnapshot(importId: string): Promise<ImportSnapshot> {
  const response = await fetch(`/api/imports/${importId}/snapshot`);

  if (!response.ok) {
    throw new Error("Import snapshot could not be loaded.");
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
        : "Adjustment session could not be created.";
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
        : "Adjustment message could not be saved.";
    throw new Error(message);
  }

  return adjustmentSessionDetailSchema.parse(await response.json());
}
