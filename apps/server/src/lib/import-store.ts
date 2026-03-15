import type {
  ImportArtifacts,
  ImportJob,
  ImportListRequest,
  ImportRequest,
  ImportSummary,
} from "@chat-exporter/shared";
import { withTransaction } from "../db/client.js";
import {
  ArtifactGeneratorRegistry,
  handoverGenerator,
  jsonGenerator,
  markdownGenerator,
} from "./artifact-generators.js";
import { IMPORT_TIMEOUT_MS } from "./constants.js";
import { conversationWordCount } from "./conversation-artifacts.js";
import {
  deleteImport,
  getPersistedImport,
  insertImport,
  listImportSummaries,
  replaceImport,
  saveImportSnapshot,
} from "./import-repository.js";
import { importSharePage } from "./share-import.js";
import { classifySourcePlatform } from "./source-platform.js";

function now() {
  return new Date().toISOString();
}

const generatorRegistry = new ArtifactGeneratorRegistry();
generatorRegistry.register(markdownGenerator);
generatorRegistry.register(handoverGenerator);
generatorRegistry.register(jsonGenerator);

function buildArtifacts(job: ImportJob): ImportArtifacts {
  const conversation = job.conversation;

  if (!conversation) {
    const artifacts: Record<string, string> = {};
    for (const gen of generatorRegistry.getAll()) {
      artifacts[gen.formatId] = "";
    }
    return artifacts;
  }

  const artifacts: Record<string, string> = {};
  for (const gen of generatorRegistry.getAll()) {
    artifacts[gen.formatId] = gen.generate(conversation);
  }
  return artifacts;
}

function patchJob(id: string, patch: Partial<ImportJob>) {
  const existing = getPersistedImport(id);
  if (!existing) {
    return;
  }

  replaceImport({
    ...existing,
    ...patch,
    updatedAt: now(),
  });
}

export function listImportJobs(
  params?: Partial<ImportListRequest>,
): ImportSummary[] {
  return listImportSummaries(params);
}

export function getImportJob(id: string) {
  return getPersistedImport(id);
}

export function deleteImportJob(id: string): boolean {
  return deleteImport(id);
}

export function createImportJob(input: ImportRequest) {
  const timestamp = now();
  const job: ImportJob = {
    id: crypto.randomUUID(),
    sourceUrl: input.url,
    sourcePlatform: classifySourcePlatform(input.url),
    mode: input.mode,
    status: "queued",
    currentStage: "validate",
    createdAt: timestamp,
    updatedAt: timestamp,
    warnings: [],
  };

  insertImport(job);
  return job;
}

export async function runImportJob(id: string) {
  const job = getPersistedImport(id);
  if (!job) {
    return;
  }

  patchJob(id, {
    status: "running",
    currentStage: "validate",
    error: undefined,
  });

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `Import timed out after ${IMPORT_TIMEOUT_MS / 1_000}s waiting for the share page to load.`,
          ),
        );
      }, IMPORT_TIMEOUT_MS);
    });

    let imported: Awaited<ReturnType<typeof importSharePage>> | undefined;
    try {
      imported = await Promise.race([
        importSharePage(job.sourceUrl, {
          sourcePlatform: job.sourcePlatform,
          onStage: (stage) => {
            patchJob(id, {
              currentStage: stage,
            });
          },
        }),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timeoutHandle);
    }

    withTransaction(() => {
      patchJob(id, {
        currentStage: "render",
        conversation: imported.conversation,
        summary: {
          messageCount: imported.conversation.messages.length,
          transcriptWords: conversationWordCount(imported.conversation),
        },
        warnings: imported.warnings,
      });

      saveImportSnapshot({
        importId: id,
        sourceUrl: job.sourceUrl,
        finalUrl: imported.snapshot.finalUrl,
        fetchedAt: imported.snapshot.fetchedAt,
        pageTitle: imported.snapshot.pageTitle,
        rawHtml: imported.snapshot.rawHtml,
        normalizedPayload: imported.snapshot.normalizedPayload,
        fetchMetadata: imported.snapshot.fetchMetadata,
      });

      const rendered = getImportJob(id);
      if (!rendered) {
        return;
      }

      patchJob(id, {
        status: "completed",
        currentStage: "done",
        artifacts: buildArtifacts(rendered),
      });
    });
  } catch (error) {
    const currentJob = getPersistedImport(id);
    patchJob(id, {
      status: "failed",
      errorStage: currentJob?.currentStage,
      currentStage: "done",
      error:
        error instanceof Error
          ? error.message
          : "Die Import-Pipeline ist fehlgeschlagen.",
    });
  }
}
