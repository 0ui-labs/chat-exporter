import type { ImportJob } from "@chat-exporter/shared";
import { afterEach, describe, expect, test } from "vitest";

import {
  deleteImport,
  getPersistedImportSnapshot,
  insertImport,
  listImportSummaries,
  saveImportSnapshot,
} from "./import-repository.js";

function createTestImportJob(overrides?: Partial<ImportJob>): ImportJob {
  return {
    id: crypto.randomUUID(),
    sourceUrl: "https://chatgpt.com/share/default-test",
    sourcePlatform: "chatgpt",
    mode: "archive",
    status: "queued",
    currentStage: "validate",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    warnings: [],
    ...overrides,
  };
}

function createTestSnapshot(
  importId: string,
  overrides?: Partial<Parameters<typeof saveImportSnapshot>[0]>,
) {
  return {
    importId,
    sourceUrl: "https://chatgpt.com/share/default-test",
    finalUrl: "https://chatgpt.com/share/default-test",
    fetchedAt: new Date().toISOString(),
    pageTitle: "Default Page Title",
    rawHtml: "<html></html>",
    normalizedPayload: { messages: [] },
    fetchMetadata: { articleCount: 1 },
    ...overrides,
  };
}

const createdImportIds: string[] = [];

afterEach(() => {
  for (const id of createdImportIds) {
    deleteImport(id);
  }
  createdImportIds.length = 0;
});

function trackImport(job: ImportJob) {
  insertImport(job);
  createdImportIds.push(job.id);
}

describe("listImportSummaries", () => {
  test("returns all imports sorted by createdAt DESC when called without params", () => {
    const older = createTestImportJob({
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = createTestImportJob({
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    trackImport(older);
    trackImport(newer);

    const result = listImportSummaries();

    const ids = result.map((r) => r.id);
    const olderIdx = ids.indexOf(older.id);
    const newerIdx = ids.indexOf(newer.id);
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  test("filters by status when status param is provided", () => {
    const completed = createTestImportJob({
      status: "completed",
      currentStage: "done",
    });
    const failed = createTestImportJob({
      status: "failed",
      currentStage: "done",
    });
    trackImport(completed);
    trackImport(failed);

    const result = listImportSummaries({ status: "completed" });

    const ids = result.map((r) => r.id);
    expect(ids).toContain(completed.id);
    expect(ids).not.toContain(failed.id);
  });

  test("filters by platform when platform param is provided", () => {
    const chatgpt = createTestImportJob({
      sourcePlatform: "chatgpt",
      sourceUrl: "https://chatgpt.com/share/a",
    });
    const claude = createTestImportJob({
      sourcePlatform: "claude",
      sourceUrl: "https://claude.ai/share/a",
    });
    trackImport(chatgpt);
    trackImport(claude);

    const result = listImportSummaries({ platform: "chatgpt" });

    const ids = result.map((r) => r.id);
    expect(ids).toContain(chatgpt.id);
    expect(ids).not.toContain(claude.id);
  });

  test("filters by search term matching sourceUrl", () => {
    const matching = createTestImportJob({
      sourceUrl: "https://chatgpt.com/share/test-search-match",
    });
    const nonMatching = createTestImportJob({
      sourceUrl: "https://chatgpt.com/share/other-xyz",
    });
    trackImport(matching);
    trackImport(nonMatching);

    const result = listImportSummaries({ search: "test-search-match" });

    const ids = result.map((r) => r.id);
    expect(ids).toContain(matching.id);
    expect(ids).not.toContain(nonMatching.id);
  });

  test("filters by search term matching pageTitle from snapshot", () => {
    const matching = createTestImportJob({
      sourceUrl: "https://chatgpt.com/share/snap-a",
    });
    const nonMatching = createTestImportJob({
      sourceUrl: "https://chatgpt.com/share/snap-b",
    });
    trackImport(matching);
    trackImport(nonMatching);
    saveImportSnapshot(
      createTestSnapshot(matching.id, {
        pageTitle: "Unique Title For Search",
      }),
    );
    saveImportSnapshot(
      createTestSnapshot(nonMatching.id, { pageTitle: "Something Else" }),
    );

    const result = listImportSummaries({ search: "Unique Title" });

    const ids = result.map((r) => r.id);
    expect(ids).toContain(matching.id);
    expect(ids).not.toContain(nonMatching.id);
  });

  test("sorts by updatedAt ASC when sortBy and sortOrder are provided", () => {
    const older = createTestImportJob({
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    const newer = createTestImportJob({
      updatedAt: "2026-02-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    trackImport(older);
    trackImport(newer);

    const result = listImportSummaries({
      sortBy: "updatedAt",
      sortOrder: "asc",
    });

    const ids = result.map((r) => r.id);
    const olderIdx = ids.indexOf(older.id);
    const newerIdx = ids.indexOf(newer.id);
    expect(olderIdx).toBeLessThan(newerIdx);
  });

  test("includes pageTitle from joined importSnapshots", () => {
    const job = createTestImportJob();
    trackImport(job);
    saveImportSnapshot(
      createTestSnapshot(job.id, { pageTitle: "My Page Title" }),
    );

    const result = listImportSummaries();

    const summary = result.find((r) => r.id === job.id);
    expect(summary?.pageTitle).toBe("My Page Title");
  });

  test("does not include conversation or artifacts fields", () => {
    const job = createTestImportJob({
      status: "completed",
      currentStage: "done",
      conversation: {
        id: "conv-1",
        title: "Test",
        source: {
          platform: "chatgpt",
          url: "https://chatgpt.com/share/default-test",
        },
        messages: [],
      },
      artifacts: { markdown: "# Test", handover: "handover", json: "{}" },
    });
    trackImport(job);

    const result = listImportSummaries();

    const summary = result.find((r) => r.id === job.id);
    expect(summary).toBeDefined();
    if (summary) {
      expect("conversation" in summary).toBe(false);
      expect("artifacts" in summary).toBe(false);
    }
  });
});

describe("deleteImport", () => {
  test("returns true and removes the import when id exists", () => {
    const job = createTestImportJob();
    insertImport(job);

    const result = deleteImport(job.id);

    expect(result).toBe(true);
    const summaries = listImportSummaries();
    expect(summaries.find((r) => r.id === job.id)).toBeUndefined();
  });

  test("returns false when id does not exist", () => {
    const result = deleteImport("non-existent-id");

    expect(result).toBe(false);
  });

  test("cascades delete to import snapshots", () => {
    const job = createTestImportJob();
    insertImport(job);
    saveImportSnapshot(
      createTestSnapshot(job.id, { pageTitle: "Cascade Test" }),
    );

    const result = deleteImport(job.id);

    expect(result).toBe(true);
    const snapshot = getPersistedImportSnapshot(job.id);
    expect(snapshot).toBeUndefined();
  });
});
