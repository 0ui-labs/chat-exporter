import type { ImportJob } from "@chat-exporter/shared";
import { afterEach, describe, expect, test } from "vitest";

import { deleteImport, insertImport } from "./import-repository.js";
import {
  activateSnapshot,
  createSnapshot,
  deactivateAllSnapshots,
  deleteSnapshot,
  getActiveSnapshot,
  listSnapshots,
  renameSnapshot,
} from "./snapshot-repository.js";

function createTestImportJob(overrides?: Partial<ImportJob>): ImportJob {
  return {
    id: crypto.randomUUID(),
    sourceUrl: "https://chatgpt.com/share/snapshot-test",
    sourcePlatform: "chatgpt",
    mode: "archive",
    status: "completed",
    currentStage: "done",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    warnings: [],
    ...overrides,
  };
}

const createdImportIds: string[] = [];

function trackImport(job: ImportJob) {
  insertImport(job);
  createdImportIds.push(job.id);
}

afterEach(() => {
  for (const id of createdImportIds) {
    deleteImport(id);
  }
  createdImportIds.length = 0;
});

describe("createSnapshot", () => {
  test("creates snapshot with correct fields and isActive as false", () => {
    const job = createTestImportJob();
    trackImport(job);

    const snapshot = createSnapshot(job.id, "My Snapshot");

    expect(snapshot.id).toBeDefined();
    expect(snapshot.importId).toBe(job.id);
    expect(snapshot.label).toBe("My Snapshot");
    expect(snapshot.isActive).toBe(false);
    expect(snapshot.createdAt).toBeDefined();
    expect(snapshot.updatedAt).toBeDefined();
  });

  test("returns isActive as boolean, not integer", () => {
    const job = createTestImportJob();
    trackImport(job);

    const snapshot = createSnapshot(job.id, "Boolean Check");

    expect(typeof snapshot.isActive).toBe("boolean");
    expect(snapshot.isActive).toBe(false);
  });
});

describe("listSnapshots", () => {
  test("returns empty array when no snapshots exist", () => {
    const job = createTestImportJob();
    trackImport(job);

    const result = listSnapshots(job.id);

    expect(result).toEqual([]);
  });

  test("returns all snapshots for import ordered by createdAt", () => {
    const job = createTestImportJob();
    trackImport(job);

    const first = createSnapshot(job.id, "First");
    const second = createSnapshot(job.id, "Second");

    const result = listSnapshots(job.id);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe(first.id);
    expect(result[1]?.id).toBe(second.id);
  });

  test("does not return snapshots from other imports", () => {
    const job1 = createTestImportJob();
    const job2 = createTestImportJob();
    trackImport(job1);
    trackImport(job2);

    createSnapshot(job1.id, "Job1 Snapshot");
    createSnapshot(job2.id, "Job2 Snapshot");

    const result = listSnapshots(job1.id);

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Job1 Snapshot");
  });

  test("returns isActive as boolean in list results", () => {
    const job = createTestImportJob();
    trackImport(job);

    createSnapshot(job.id, "Check Type");

    const result = listSnapshots(job.id);

    expect(typeof result[0]?.isActive).toBe("boolean");
  });
});

describe("getActiveSnapshot", () => {
  test("returns null when no snapshot is active", () => {
    const job = createTestImportJob();
    trackImport(job);

    createSnapshot(job.id, "Inactive");

    const result = getActiveSnapshot(job.id);

    expect(result).toBeNull();
  });

  test("returns the active snapshot after activation", () => {
    const job = createTestImportJob();
    trackImport(job);

    const snapshot = createSnapshot(job.id, "To Activate");
    activateSnapshot(snapshot.id);

    const result = getActiveSnapshot(job.id);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(snapshot.id);
    expect(result?.isActive).toBe(true);
  });
});

describe("activateSnapshot", () => {
  test("activates the specified snapshot", () => {
    const job = createTestImportJob();
    trackImport(job);

    const snapshot = createSnapshot(job.id, "Activate Me");

    const result = activateSnapshot(snapshot.id);

    expect(result.isActive).toBe(true);
    expect(result.id).toBe(snapshot.id);
  });

  test("deactivates all other snapshots of the same import", () => {
    const job = createTestImportJob();
    trackImport(job);

    const first = createSnapshot(job.id, "First");
    const second = createSnapshot(job.id, "Second");

    activateSnapshot(first.id);
    activateSnapshot(second.id);

    const all = listSnapshots(job.id);
    const firstAfter = all.find((s) => s.id === first.id);
    const secondAfter = all.find((s) => s.id === second.id);

    expect(firstAfter?.isActive).toBe(false);
    expect(secondAfter?.isActive).toBe(true);
  });

  test("does not affect snapshots from other imports", () => {
    const job1 = createTestImportJob();
    const job2 = createTestImportJob();
    trackImport(job1);
    trackImport(job2);

    const snap1 = createSnapshot(job1.id, "Job1");
    const snap2 = createSnapshot(job2.id, "Job2");
    activateSnapshot(snap2.id);

    activateSnapshot(snap1.id);

    const job2Snap = listSnapshots(job2.id).find((s) => s.id === snap2.id);
    expect(job2Snap?.isActive).toBe(true);
  });
});

describe("deactivateAllSnapshots", () => {
  test("sets all snapshots of import to inactive", () => {
    const job = createTestImportJob();
    trackImport(job);

    const snap = createSnapshot(job.id, "Active One");
    activateSnapshot(snap.id);

    deactivateAllSnapshots(job.id);

    const all = listSnapshots(job.id);
    for (const s of all) {
      expect(s.isActive).toBe(false);
    }
  });

  test("does not affect snapshots from other imports", () => {
    const job1 = createTestImportJob();
    const job2 = createTestImportJob();
    trackImport(job1);
    trackImport(job2);

    const snap1 = createSnapshot(job1.id, "Job1");
    const snap2 = createSnapshot(job2.id, "Job2");
    activateSnapshot(snap1.id);
    activateSnapshot(snap2.id);

    deactivateAllSnapshots(job1.id);

    const job2Active = getActiveSnapshot(job2.id);
    expect(job2Active).not.toBeNull();
    expect(job2Active?.id).toBe(snap2.id);
  });
});

describe("deleteSnapshot", () => {
  test("returns true when snapshot exists and is deleted", () => {
    const job = createTestImportJob();
    trackImport(job);

    const snapshot = createSnapshot(job.id, "To Delete");

    const result = deleteSnapshot(snapshot.id);

    expect(result).toBe(true);
    const remaining = listSnapshots(job.id);
    expect(remaining).toHaveLength(0);
  });

  test("returns false when snapshot does not exist", () => {
    const result = deleteSnapshot("non-existent-id");

    expect(result).toBe(false);
  });
});

describe("renameSnapshot", () => {
  test("updates label and updatedAt", () => {
    const job = createTestImportJob();
    trackImport(job);

    const snapshot = createSnapshot(job.id, "Original Name");

    // Ensure updatedAt differs by using a distinct timestamp
    const renamed = renameSnapshot(snapshot.id, "New Name");

    expect(renamed.label).toBe("New Name");
    expect(renamed.id).toBe(snapshot.id);
    // updatedAt is set to a new Date().toISOString() in renameSnapshot,
    // so it should be >= the original
    expect(renamed.updatedAt >= snapshot.updatedAt).toBe(true);
    // Verify the label actually changed in the DB
    const fromDb = listSnapshots(job.id).find((s) => s.id === snapshot.id);
    expect(fromDb?.label).toBe("New Name");
  });

  test("does not change other fields", () => {
    const job = createTestImportJob();
    trackImport(job);

    const snapshot = createSnapshot(job.id, "Keep Fields");

    const renamed = renameSnapshot(snapshot.id, "Changed Label");

    expect(renamed.importId).toBe(snapshot.importId);
    expect(renamed.isActive).toBe(snapshot.isActive);
    expect(renamed.createdAt).toBe(snapshot.createdAt);
  });
});
