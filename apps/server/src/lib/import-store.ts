import type { ImportArtifacts, ImportJob, ImportRequest } from "@chat-exporter/shared";

import {
  conversationToMarkdown,
  conversationToHandover,
  conversationWordCount
} from "./conversation-artifacts.js";
import {
  getPersistedImport,
  insertImport,
  listPersistedImports,
  replaceImport,
  saveImportSnapshot
} from "./import-repository.js";
import { importSharePage } from "./share-import.js";
import { classifySourcePlatform } from "./source-platform.js";

function now() {
  return new Date().toISOString();
}

function buildArtifacts(job: ImportJob): ImportArtifacts {
  const conversation = job.conversation;

  if (!conversation) {
    return {
      markdown: "",
      handover: "",
      json: ""
    };
  }

  return {
    markdown: conversationToMarkdown(conversation),
    handover: conversationToHandover(conversation),
    json: JSON.stringify(conversation, null, 2)
  };
}

function patchJob(id: string, patch: Partial<ImportJob>) {
  const existing = getPersistedImport(id);
  if (!existing) {
    return;
  }

  replaceImport({
    ...existing,
    ...patch,
    updatedAt: now()
  });
}

export function listImportJobs() {
  return listPersistedImports();
}

export function getImportJob(id: string) {
  return getPersistedImport(id);
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
    warnings: []
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
    error: undefined
  });

  try {
    const imported = await importSharePage(job.sourceUrl, {
      sourcePlatform: job.sourcePlatform,
      onStage: (stage) => {
        patchJob(id, {
          currentStage: stage
        });
      }
    });

    patchJob(id, {
      currentStage: "render",
      conversation: imported.conversation,
      summary: {
        messageCount: imported.conversation.messages.length,
        transcriptWords: conversationWordCount(imported.conversation)
      },
      warnings: imported.warnings
    });

    saveImportSnapshot({
      importId: id,
      sourceUrl: job.sourceUrl,
      finalUrl: imported.snapshot.finalUrl,
      fetchedAt: imported.snapshot.fetchedAt,
      pageTitle: imported.snapshot.pageTitle,
      rawHtml: imported.snapshot.rawHtml,
      normalizedPayload: imported.snapshot.normalizedPayload,
      fetchMetadata: imported.snapshot.fetchMetadata
    });

    const rendered = getImportJob(id);
    if (!rendered) {
      return;
    }

    patchJob(id, {
      status: "completed",
      currentStage: "done",
      artifacts: buildArtifacts(rendered)
    });
  } catch (error) {
    patchJob(id, {
      status: "failed",
      currentStage: "done",
      error:
        error instanceof Error
          ? error.message
          : "The import pipeline failed before a conversation could be extracted."
    });
  }
}
