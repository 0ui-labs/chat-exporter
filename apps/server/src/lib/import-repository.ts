import type {
  Conversation,
  ImportArtifacts,
  ImportJob,
  ImportListRequest,
  ImportSummary,
} from "@chat-exporter/shared";
import { importJobSchema, importSummarySchema } from "@chat-exporter/shared";
import { and, asc, desc, eq, like, or } from "drizzle-orm";

import { db } from "../db/client.js";
import type { Import } from "../db/schema.js";
import { importSnapshots, imports } from "../db/schema.js";

function serializeImport(job: ImportJob) {
  return {
    id: job.id,
    sourceUrl: job.sourceUrl,
    sourcePlatform: job.sourcePlatform,
    mode: job.mode,
    importMethod: job.importMethod,
    status: job.status,
    currentStage: job.currentStage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    warningsJson: JSON.stringify(job.warnings),
    error: job.error ?? null,
    errorStage: job.errorStage ?? null,
    summaryJson: job.summary ? JSON.stringify(job.summary) : null,
    conversationJson: job.conversation
      ? JSON.stringify(job.conversation)
      : null,
    artifactsJson: job.artifacts ? JSON.stringify(job.artifacts) : null,
  };
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
}

function deserializeImport(row: Import) {
  return importJobSchema.parse({
    id: row.id,
    sourceUrl: row.sourceUrl,
    sourcePlatform: row.sourcePlatform,
    mode: row.mode,
    importMethod: row.importMethod,
    status: row.status,
    currentStage: row.currentStage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    warnings: parseJson<string[]>(row.warningsJson) ?? [],
    error: row.error ?? undefined,
    errorStage: row.errorStage ?? undefined,
    summary: parseJson<ImportJob["summary"]>(row.summaryJson),
    conversation: parseJson<Conversation>(row.conversationJson),
    artifacts: parseJson<ImportArtifacts>(row.artifactsJson),
  });
}

export function insertImport(job: ImportJob) {
  db.insert(imports).values(serializeImport(job)).run();
}

export function replaceImport(job: ImportJob) {
  const data = serializeImport(job);
  const { id: _id, ...fields } = data;
  db.update(imports).set(fields).where(eq(imports.id, job.id)).run();
}

export function getPersistedImport(id: string) {
  const row = db.select().from(imports).where(eq(imports.id, id)).get();
  return row ? deserializeImport(row) : undefined;
}

export function listPersistedImports() {
  return db
    .select()
    .from(imports)
    .orderBy(desc(imports.createdAt))
    .all()
    .map(deserializeImport);
}

export function saveImportSnapshot(input: {
  importId: string;
  sourceUrl: string;
  finalUrl: string;
  fetchedAt: string;
  pageTitle: string;
  rawHtml: string;
  normalizedPayload: unknown;
  fetchMetadata: Record<string, unknown>;
}) {
  const data = {
    importId: input.importId,
    sourceUrl: input.sourceUrl,
    finalUrl: input.finalUrl,
    fetchedAt: input.fetchedAt,
    pageTitle: input.pageTitle,
    rawHtml: input.rawHtml,
    normalizedPayloadJson: JSON.stringify(input.normalizedPayload),
    fetchMetadataJson: JSON.stringify(input.fetchMetadata),
    updatedAt: input.fetchedAt,
  };

  db.insert(importSnapshots)
    .values(data)
    .onConflictDoUpdate({
      target: importSnapshots.importId,
      set: {
        sourceUrl: data.sourceUrl,
        finalUrl: data.finalUrl,
        fetchedAt: data.fetchedAt,
        pageTitle: data.pageTitle,
        rawHtml: data.rawHtml,
        normalizedPayloadJson: data.normalizedPayloadJson,
        fetchMetadataJson: data.fetchMetadataJson,
        updatedAt: data.updatedAt,
      },
    })
    .run();
}

export function listImportSummaries(
  params?: Partial<ImportListRequest>,
): ImportSummary[] {
  const sortBy = params?.sortBy ?? "createdAt";
  const sortOrder = params?.sortOrder ?? "desc";

  const columnMap = {
    createdAt: imports.createdAt,
    updatedAt: imports.updatedAt,
    sourcePlatform: imports.sourcePlatform,
    status: imports.status,
  } as const;

  const orderColumn = columnMap[sortBy];
  const orderFn = sortOrder === "asc" ? asc : desc;

  let query = db
    .select({
      id: imports.id,
      sourceUrl: imports.sourceUrl,
      sourcePlatform: imports.sourcePlatform,
      mode: imports.mode,
      importMethod: imports.importMethod,
      status: imports.status,
      currentStage: imports.currentStage,
      createdAt: imports.createdAt,
      updatedAt: imports.updatedAt,
      warningsJson: imports.warningsJson,
      error: imports.error,
      summaryJson: imports.summaryJson,
      pageTitle: importSnapshots.pageTitle,
    })
    .from(imports)
    .leftJoin(importSnapshots, eq(imports.id, importSnapshots.importId))
    .orderBy(orderFn(orderColumn))
    .$dynamic();

  const conditions = [];

  if (params?.status) {
    conditions.push(eq(imports.status, params.status));
  }

  if (params?.platform) {
    conditions.push(eq(imports.sourcePlatform, params.platform));
  }

  if (params?.search) {
    const pattern = `%${params.search}%`;
    conditions.push(
      or(
        like(imports.sourceUrl, pattern),
        like(importSnapshots.pageTitle, pattern),
      ),
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query.all().flatMap((row) => {
    try {
      const parsed = importSummarySchema.safeParse({
        id: row.id,
        sourceUrl: row.sourceUrl,
        sourcePlatform: row.sourcePlatform,
        mode: row.mode,
        importMethod: row.importMethod,
        status: row.status,
        currentStage: row.currentStage,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        warnings: parseJson<string[]>(row.warningsJson) ?? [],
        error: row.error ?? undefined,
        summary: parseJson<ImportJob["summary"]>(row.summaryJson),
        pageTitle: row.pageTitle ?? undefined,
      });
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

export function deleteImport(id: string): boolean {
  const result = db.delete(imports).where(eq(imports.id, id)).run();
  return result.changes > 0;
}

export function getPersistedImportSnapshot(importId: string) {
  const row = db
    .select()
    .from(importSnapshots)
    .where(eq(importSnapshots.importId, importId))
    .get();

  if (!row) {
    return undefined;
  }

  return {
    importId: row.importId,
    sourceUrl: row.sourceUrl,
    finalUrl: row.finalUrl,
    fetchedAt: row.fetchedAt,
    pageTitle: row.pageTitle,
    rawHtml: row.rawHtml,
    normalizedPayload: JSON.parse(row.normalizedPayloadJson) as unknown,
    fetchMetadata: JSON.parse(row.fetchMetadataJson) as Record<string, unknown>,
  };
}
