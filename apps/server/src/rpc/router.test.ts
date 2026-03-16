import { describe, expect, test, vi } from "vitest";

vi.mock("../lib/import-store.js", () => ({
  listImportJobs: vi.fn(),
  createImportJob: vi.fn(),
  runImportJob: vi.fn(),
  getImportJob: vi.fn(),
}));

vi.mock("../lib/import-repository.js", () => ({
  getPersistedImportSnapshot: vi.fn(),
}));

vi.mock("../lib/adjustment-repository.js", () => ({
  createAdjustmentSession: vi.fn(),
  getAdjustmentSessionDetail: vi.fn(),
  listAdjustmentSessions: vi.fn(),
  listFormatRules: vi.fn(),
  getAdjustmentMetrics: vi.fn(),
  disableFormatRule: vi.fn(),
  appendAdjustmentMessage: vi.fn(),
  createFormatRuleDirect: vi.fn(),
  updateFormatRuleEffect: vi.fn(),
  discardAdjustmentSession: vi.fn(),
  recordAdjustmentEvent: vi.fn(),
  reopenAdjustmentSession: vi.fn(),
  promoteRuleToProfile: vi.fn(),
  demoteRuleToLocal: vi.fn(),
  markSessionApplied: vi.fn(),
}));

vi.mock("../lib/adjustment-agent.js", () => ({
  runAgentTurn: vi.fn(),
  AgentUnavailableError: class AgentUnavailableError extends Error {},
}));

vi.mock("../lib/delete-repository.js", () => ({
  listDeletions: vi.fn(),
  softDeleteMessage: vi.fn(),
  softDeleteRound: vi.fn(),
  restoreMessage: vi.fn(),
}));

vi.mock("../lib/edit-repository.js", () => ({
  saveMessageEdit: vi.fn(),
  getMessageEdit: vi.fn(),
  listMessageEdits: vi.fn(),
  deleteMessageEdit: vi.fn(),
  countEdits: vi.fn(),
}));

vi.mock("../lib/snapshot-repository.js", () => ({
  createSnapshot: vi.fn(),
  listSnapshots: vi.fn(),
  getActiveSnapshot: vi.fn(),
  getSnapshotById: vi.fn(),
  activateSnapshot: vi.fn(),
  deactivateAllSnapshots: vi.fn(),
  deleteSnapshot: vi.fn(),
  renameSnapshot: vi.fn(),
}));

vi.mock("../db/client.js", () => ({
  databasePath: "/test/chat-exporter.db",
  db: {},
  rawDb: {},
  withTransaction: (fn: () => unknown) => fn(),
}));

import { createRouterClient, ORPCError } from "@orpc/server";
import { runAgentTurn } from "../lib/adjustment-agent.js";
import {
  appendAdjustmentMessage,
  createAdjustmentSession,
  disableFormatRule,
  discardAdjustmentSession,
  getAdjustmentMetrics,
  getAdjustmentSessionDetail,
  listAdjustmentSessions,
  listFormatRules,
  recordAdjustmentEvent,
  reopenAdjustmentSession,
} from "../lib/adjustment-repository.js";
import {
  listDeletions,
  restoreMessage,
  softDeleteMessage,
  softDeleteRound,
} from "../lib/delete-repository.js";
import {
  deleteMessageEdit,
  listMessageEdits,
  saveMessageEdit,
} from "../lib/edit-repository.js";
import { getPersistedImportSnapshot } from "../lib/import-repository.js";
import {
  createImportJob,
  getImportJob,
  listImportJobs,
  runImportJob,
} from "../lib/import-store.js";
import {
  activateSnapshot,
  createSnapshot,
  deactivateAllSnapshots,
  deleteSnapshot,
  getSnapshotById,
  listSnapshots,
  renameSnapshot,
} from "../lib/snapshot-repository.js";
import { RAW_HTML_PREVIEW_LENGTH, router } from "./router.js";

const client = createRouterClient(router);

const mockListImportJobs = listImportJobs as ReturnType<typeof vi.fn>;
const mockCreateImportJob = createImportJob as ReturnType<typeof vi.fn>;
const mockRunImportJob = runImportJob as ReturnType<typeof vi.fn>;
const mockGetImportJob = getImportJob as ReturnType<typeof vi.fn>;
const mockGetPersistedImportSnapshot = getPersistedImportSnapshot as ReturnType<
  typeof vi.fn
>;
const mockCreateAdjustmentSession = createAdjustmentSession as ReturnType<
  typeof vi.fn
>;
const mockGetAdjustmentSessionDetail = getAdjustmentSessionDetail as ReturnType<
  typeof vi.fn
>;
const mockListAdjustmentSessions = listAdjustmentSessions as ReturnType<
  typeof vi.fn
>;
const mockListFormatRules = listFormatRules as ReturnType<typeof vi.fn>;
const mockGetAdjustmentMetrics = getAdjustmentMetrics as ReturnType<
  typeof vi.fn
>;
const mockDisableFormatRule = disableFormatRule as ReturnType<typeof vi.fn>;
const mockAppendAdjustmentMessage = appendAdjustmentMessage as ReturnType<
  typeof vi.fn
>;
const mockDiscardAdjustmentSession = discardAdjustmentSession as ReturnType<
  typeof vi.fn
>;
const mockRunAgentTurn = runAgentTurn as ReturnType<typeof vi.fn>;
const mockRecordAdjustmentEvent = recordAdjustmentEvent as ReturnType<
  typeof vi.fn
>;
const _mockReopenAdjustmentSession = reopenAdjustmentSession as ReturnType<
  typeof vi.fn
>;
const mockListDeletions = listDeletions as ReturnType<typeof vi.fn>;
const mockSoftDeleteMessage = softDeleteMessage as ReturnType<typeof vi.fn>;
const mockSoftDeleteRound = softDeleteRound as ReturnType<typeof vi.fn>;
const mockRestoreMessage = restoreMessage as ReturnType<typeof vi.fn>;
const mockSaveMessageEdit = saveMessageEdit as ReturnType<typeof vi.fn>;
const mockDeleteMessageEdit = deleteMessageEdit as ReturnType<typeof vi.fn>;
const mockListMessageEdits = listMessageEdits as ReturnType<typeof vi.fn>;
const mockCreateSnapshot = createSnapshot as ReturnType<typeof vi.fn>;
const mockListSnapshots = listSnapshots as ReturnType<typeof vi.fn>;
const mockActivateSnapshot = activateSnapshot as ReturnType<typeof vi.fn>;
const mockDeactivateAllSnapshots = deactivateAllSnapshots as ReturnType<
  typeof vi.fn
>;
const mockDeleteSnapshot = deleteSnapshot as ReturnType<typeof vi.fn>;
const mockRenameSnapshot = renameSnapshot as ReturnType<typeof vi.fn>;
const mockGetSnapshotById = getSnapshotById as ReturnType<typeof vi.fn>;

function createImportJobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "import-1",
    sourceUrl: "https://chatgpt.com/share/abc",
    sourcePlatform: "chatgpt",
    mode: "archive",
    importMethod: "share-link",
    status: "completed",
    currentStage: "done",
    createdAt: "2026-03-08T12:00:00.000Z",
    updatedAt: "2026-03-08T12:00:00.000Z",
    warnings: [],
    artifacts: {
      markdown: "# Chat",
      handover: "Chat handover",
      json: '{"messages":[]}',
    },
    ...overrides,
  };
}

function createSessionDetailFixture(overrides: Record<string, unknown> = {}) {
  return {
    session: {
      id: "session-1",
      importId: "import-1",
      targetFormat: "markdown",
      status: "open",
      selection: {
        blockIndex: 0,
        blockType: "paragraph",
        messageId: "msg-1",
        messageIndex: 0,
        messageRole: "assistant",
        selectedText: "Hello",
        textQuote: "Hello",
      },
      createdAt: "2026-03-08T12:00:00.000Z",
      updatedAt: "2026-03-08T12:00:00.000Z",
    },
    messages: [],
    ...overrides,
  };
}

describe("RAW_HTML_PREVIEW_LENGTH", () => {
  test("is exported with value 16_000", () => {
    expect(RAW_HTML_PREVIEW_LENGTH).toBe(16_000);
  });
});

describe("health.check", () => {
  test("returns service info with database path", async () => {
    const result = await client.health.check();

    expect(result).toEqual({
      ok: true,
      service: "chat-exporter-api",
      databasePath: "/test/chat-exporter.db",
    });
  });
});

describe("imports.list", () => {
  test("returns import summaries", async () => {
    const jobs = [createImportJobFixture()];
    mockListImportJobs.mockReturnValue(jobs);

    const result = await client.imports.list();

    const firstJob = jobs[0];
    if (!firstJob) throw new Error("Expected at least one job");
    const { artifacts, ...expectedSummary } = firstJob;
    expect(result).toEqual([expectedSummary]);
    expect(mockListImportJobs).toHaveBeenCalledOnce();
  });
});

describe("imports.create", () => {
  test("creates import job for valid ChatGPT share link", async () => {
    const job = createImportJobFixture({ status: "queued" });
    mockCreateImportJob.mockReturnValue(job);
    mockRunImportJob.mockResolvedValue(undefined);

    const result = await client.imports.create({
      url: "https://chatgpt.com/share/abc-123",
      mode: "archive",
    });

    expect(result).toEqual(job);
    expect(mockCreateImportJob).toHaveBeenCalledWith({
      url: "https://chatgpt.com/share/abc-123",
      mode: "archive",
    });
    expect(mockRunImportJob).toHaveBeenCalledWith(job.id);
  });

  test("rejects non-ChatGPT share link with BAD_REQUEST", async () => {
    await expect(
      client.imports.create({
        url: "https://example.com/not-a-share-link",
        mode: "archive",
      }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("imports.get", () => {
  test("returns import job by id", async () => {
    const job = createImportJobFixture();
    mockGetImportJob.mockReturnValue(job);

    const result = await client.imports.get({ id: "import-1" });

    expect(result).toEqual(job);
  });

  test("throws NOT_FOUND when import does not exist", async () => {
    mockGetImportJob.mockReturnValue(undefined);

    await expect(client.imports.get({ id: "nonexistent" })).rejects.toThrow(
      ORPCError,
    );
  });
});

describe("imports.snapshot", () => {
  test("returns truncated snapshot", async () => {
    mockGetPersistedImportSnapshot.mockReturnValue({
      importId: "import-1",
      sourceUrl: "https://chatgpt.com/share/abc",
      finalUrl: "https://chatgpt.com/share/abc",
      fetchedAt: "2026-03-08T12:00:00.000Z",
      pageTitle: "Test Chat",
      rawHtml: "<html>short</html>",
      normalizedPayload: { title: "Test", messages: [], warnings: [] },
      fetchMetadata: { articleCount: 0, messageCount: 0, rawHtmlBytes: 18 },
    });

    const result = await client.imports.snapshot({ id: "import-1" });

    expect(result.importId).toBe("import-1");
    expect(result.rawHtmlTruncated).toBe(false);
    expect(result.rawHtmlPreview).toBe("<html>short</html>");
  });

  test("throws NOT_FOUND when snapshot does not exist", async () => {
    mockGetPersistedImportSnapshot.mockReturnValue(undefined);

    await expect(
      client.imports.snapshot({ id: "nonexistent" }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("imports.rawHtml", () => {
  test("returns raw HTML string", async () => {
    mockGetPersistedImportSnapshot.mockReturnValue({
      importId: "import-1",
      sourceUrl: "https://chatgpt.com/share/abc",
      finalUrl: "https://chatgpt.com/share/abc",
      fetchedAt: "2026-03-08T12:00:00.000Z",
      pageTitle: "Test Chat",
      rawHtml: "<html>full content</html>",
      normalizedPayload: { messages: [] },
      fetchMetadata: {},
    });

    const result = await client.imports.rawHtml({ id: "import-1" });

    expect(result).toBe("<html>full content</html>");
  });

  test("throws NOT_FOUND when snapshot does not exist", async () => {
    mockGetPersistedImportSnapshot.mockReturnValue(undefined);

    await expect(client.imports.rawHtml({ id: "nonexistent" })).rejects.toThrow(
      ORPCError,
    );
  });
});

describe("imports.exportArtifact", () => {
  test("returns markdown artifact", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());

    const result = await client.imports.exportArtifact({
      id: "import-1",
      format: "markdown",
    });

    expect(result).toBe("# Chat");
  });

  test("returns handover artifact", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());

    const result = await client.imports.exportArtifact({
      id: "import-1",
      format: "handover",
    });

    expect(result).toBe("Chat handover");
  });

  test("returns json artifact", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());

    const result = await client.imports.exportArtifact({
      id: "import-1",
      format: "json",
    });

    expect(result).toBe('{"messages":[]}');
  });

  test("throws NOT_FOUND when import has no artifacts", async () => {
    mockGetImportJob.mockReturnValue(
      createImportJobFixture({ artifacts: undefined }),
    );

    await expect(
      client.imports.exportArtifact({ id: "import-1", format: "markdown" }),
    ).rejects.toThrow(ORPCError);
  });

  test("accepts arbitrary format string and returns matching artifact", async () => {
    mockGetImportJob.mockReturnValue(
      createImportJobFixture({
        artifacts: { "custom-pdf": "PDF content here" },
      }),
    );

    const result = await client.imports.exportArtifact({
      id: "import-1",
      format: "custom-pdf",
    });

    expect(result).toBe("PDF content here");
  });

  test("throws NOT_FOUND for unknown format with no matching artifact", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());

    await expect(
      client.imports.exportArtifact({
        id: "import-1",
        format: "nonexistent-format",
      }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("adjustments.listSessions", () => {
  test("returns sessions for import", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    const sessions = [createSessionDetailFixture().session];
    mockListAdjustmentSessions.mockReturnValue(sessions);

    const result = await client.adjustments.listSessions({
      importId: "import-1",
    });

    expect(result).toEqual(sessions);
    expect(mockListAdjustmentSessions).toHaveBeenCalledWith(
      "import-1",
      undefined,
    );
  });

  test("throws NOT_FOUND when import does not exist", async () => {
    mockGetImportJob.mockReturnValue(undefined);

    await expect(
      client.adjustments.listSessions({ importId: "nonexistent" }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("adjustments.createSession", () => {
  test("creates a new adjustment session", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    const detail = createSessionDetailFixture();
    mockCreateAdjustmentSession.mockReturnValue({
      session: detail.session,
      reused: false,
    });
    mockGetAdjustmentSessionDetail.mockReturnValue(detail);

    const result = await client.adjustments.createSession({
      importId: "import-1",
      selection: detail.session.selection,
      targetFormat: "markdown",
    });

    expect(result.session.id).toBe("session-1");
  });
});

describe("adjustments.getSession", () => {
  test("returns session detail", async () => {
    const detail = createSessionDetailFixture();
    mockGetAdjustmentSessionDetail.mockReturnValue(detail);

    const result = await client.adjustments.getSession({ id: "session-1" });

    expect(result.session.id).toBe("session-1");
  });

  test("throws NOT_FOUND when session does not exist", async () => {
    mockGetAdjustmentSessionDetail.mockReturnValue(undefined);

    await expect(
      client.adjustments.getSession({ id: "nonexistent" }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("adjustments.discard", () => {
  test("discards adjustment session", async () => {
    const detail = createSessionDetailFixture({
      session: {
        ...createSessionDetailFixture().session,
        status: "discarded",
      },
    });
    mockDiscardAdjustmentSession.mockReturnValue(detail);

    const result = await client.adjustments.discard({ sessionId: "session-1" });

    expect(result.session.status).toBe("discarded");
    expect(mockDiscardAdjustmentSession).toHaveBeenCalledWith("session-1");
  });

  test("throws BAD_REQUEST when discard fails", async () => {
    mockDiscardAdjustmentSession.mockImplementation(() => {
      throw new Error("Session already applied.");
    });

    await expect(
      client.adjustments.discard({ sessionId: "session-1" }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("adjustments.metrics", () => {
  test("returns metrics for import and format", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    const metrics = {
      importId: "import-1",
      targetFormat: "markdown",
      counts: {
        sessionsCreated: 2,
        clarifications: 0,
        previewsGenerated: 1,
        previewFailures: 0,
        rulesApplied: 1,
        rulesDisabled: 0,
        sessionsDiscarded: 0,
      },
      updatedAt: "2026-03-08T12:00:00.000Z",
    };
    mockGetAdjustmentMetrics.mockReturnValue(metrics);

    const result = await client.adjustments.metrics({
      importId: "import-1",
      format: "markdown",
    });

    expect(result).toEqual(metrics);
    expect(mockGetAdjustmentMetrics).toHaveBeenCalledWith(
      "import-1",
      "markdown",
    );
  });
});

describe("rules.list", () => {
  test("returns format rules for import", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    mockListFormatRules.mockReturnValue([]);

    const result = await client.rules.list({ importId: "import-1" });

    expect(result).toEqual([]);
    expect(mockListFormatRules).toHaveBeenCalledWith("import-1", undefined);
  });
});

describe("rules.disable", () => {
  test("disables a format rule", async () => {
    const rule = {
      id: "rule-1",
      importId: "import-1",
      targetFormat: "markdown",
      kind: "render",
      scope: "import_local",
      status: "disabled",
      selector: { strategy: "block_type", blockType: "paragraph" },
      instruction: "Test",
      createdAt: "2026-03-08T12:00:00.000Z",
      updatedAt: "2026-03-08T12:00:00.000Z",
    };
    mockDisableFormatRule.mockReturnValue(rule);

    const result = await client.rules.disable({ id: "rule-1" });

    expect(result.status).toBe("disabled");
    expect(mockDisableFormatRule).toHaveBeenCalledWith("rule-1", undefined);
  });

  test("throws BAD_REQUEST when disable fails", async () => {
    mockDisableFormatRule.mockImplementation(() => {
      throw new Error("Formatregel nicht gefunden.");
    });

    await expect(client.rules.disable({ id: "nonexistent" })).rejects.toThrow(
      ORPCError,
    );
  });
});

describe("adjustments.appendMessage", () => {
  test("appends user message and runs agent turn", async () => {
    const detail = createSessionDetailFixture();
    mockGetAdjustmentSessionDetail.mockReturnValue(detail);
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    mockListFormatRules.mockReturnValue([]);
    mockRunAgentTurn.mockResolvedValue({
      assistantMessage: "AI response",
      actions: [],
    });

    const updatedDetail = createSessionDetailFixture({
      messages: [
        {
          id: "msg-user",
          sessionId: "session-1",
          role: "user",
          content: "Make headings bold",
          createdAt: "2026-03-08T12:01:00.000Z",
        },
        {
          id: "msg-assistant",
          sessionId: "session-1",
          role: "assistant",
          content: "AI response",
          createdAt: "2026-03-08T12:01:01.000Z",
        },
      ],
    });
    mockGetAdjustmentSessionDetail
      .mockReturnValueOnce(detail)
      .mockReturnValueOnce(detail)
      .mockReturnValueOnce(updatedDetail)
      .mockReturnValueOnce(updatedDetail);

    const result = await client.adjustments.appendMessage({
      sessionId: "session-1",
      content: "Make headings bold",
    });

    expect(mockAppendAdjustmentMessage).toHaveBeenCalledWith(
      "session-1",
      "user",
      "Make headings bold",
    );
    expect(mockRunAgentTurn).toHaveBeenCalledOnce();
    expect(result.messages).toHaveLength(2);
  });
});

describe("deletions.list", () => {
  test("returns deletions for import", async () => {
    const deletions = [
      {
        id: "del-1",
        importId: "import-1",
        messageId: "msg-1",
        deletedAt: "2026-03-08T12:00:00.000Z",
      },
    ];
    mockListDeletions.mockReturnValue(deletions);

    const result = await client.deletions.list({ importId: "import-1" });

    expect(result).toEqual(deletions);
    expect(mockListDeletions).toHaveBeenCalledWith("import-1");
  });
});

describe("deletions.delete", () => {
  test("soft-deletes a message and records event", async () => {
    const deletion = {
      id: "del-1",
      importId: "import-1",
      messageId: "msg-1",
      deletedAt: "2026-03-08T12:00:00.000Z",
    };
    mockSoftDeleteMessage.mockReturnValue(deletion);

    const result = await client.deletions.delete({
      importId: "import-1",
      messageId: "msg-1",
    });

    expect(result).toEqual(deletion);
    expect(mockSoftDeleteMessage).toHaveBeenCalledWith(
      "import-1",
      "msg-1",
      undefined,
    );
    expect(mockRecordAdjustmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message_deleted" }),
    );
  });

  test("throws BAD_REQUEST when delete fails", async () => {
    mockSoftDeleteMessage.mockImplementation(() => {
      throw new Error("Duplicate");
    });

    await expect(
      client.deletions.delete({ importId: "import-1", messageId: "msg-1" }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("deletions.deleteRound", () => {
  test("soft-deletes a round and records event", async () => {
    const deletions = [
      {
        id: "del-1",
        importId: "import-1",
        messageId: "msg-1",
        deletedAt: "2026-03-08T12:00:00.000Z",
      },
      {
        id: "del-2",
        importId: "import-1",
        messageId: "msg-2",
        deletedAt: "2026-03-08T12:00:00.000Z",
      },
    ];
    mockSoftDeleteRound.mockReturnValue(deletions);

    const result = await client.deletions.deleteRound({
      importId: "import-1",
      messageId: "msg-1",
    });

    expect(result).toEqual(deletions);
    expect(mockSoftDeleteRound).toHaveBeenCalledWith(
      "import-1",
      "msg-1",
      undefined,
    );
    expect(mockRecordAdjustmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "round_deleted" }),
    );
  });

  test("throws BAD_REQUEST when round delete fails", async () => {
    mockSoftDeleteRound.mockImplementation(() => {
      throw new Error("Not found");
    });

    await expect(
      client.deletions.deleteRound({
        importId: "import-1",
        messageId: "msg-1",
      }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("deletions.restore", () => {
  test("restores a deleted message and records event", async () => {
    mockRestoreMessage.mockReturnValue(true);

    const result = await client.deletions.restore({
      importId: "import-1",
      messageId: "msg-1",
    });

    expect(result).toEqual({ restored: true });
    expect(mockRestoreMessage).toHaveBeenCalledWith("import-1", "msg-1");
    expect(mockRecordAdjustmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message_restored" }),
    );
  });

  test("returns false when message was not deleted", async () => {
    mockRestoreMessage.mockReturnValue(false);

    const result = await client.deletions.restore({
      importId: "import-1",
      messageId: "msg-1",
    });

    expect(result).toEqual({ restored: false });
  });
});

// --- Edits ---

function createMessageEditFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "edit-1",
    importId: "import-1",
    snapshotId: "snap-1",
    messageId: "msg-1",
    editedBlocksJson: JSON.stringify([{ type: "paragraph", text: "Edited" }]),
    annotation: null,
    createdAt: "2026-03-08T12:00:00.000Z",
    updatedAt: "2026-03-08T12:00:00.000Z",
    ...overrides,
  };
}

function createSnapshotFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "snap-1",
    importId: "import-1",
    label: "Draft v1",
    isActive: false,
    createdAt: "2026-03-08T12:00:00.000Z",
    updatedAt: "2026-03-08T12:00:00.000Z",
    ...overrides,
  };
}

describe("edits.save", () => {
  test("saves a message edit and returns it", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    mockGetSnapshotById.mockReturnValue(createSnapshotFixture());
    mockSaveMessageEdit.mockReturnValue(createMessageEditFixture());

    const result = await client.edits.save({
      importId: "import-1",
      snapshotId: "snap-1",
      messageId: "msg-1",
      editedBlocks: [{ type: "paragraph", text: "Edited" }],
    });

    expect(result.id).toBe("edit-1");
    expect(result.snapshotId).toBe("snap-1");
    expect(result.messageId).toBe("msg-1");
    expect(mockSaveMessageEdit).toHaveBeenCalledWith(
      "import-1",
      "snap-1",
      "msg-1",
      expect.stringContaining('"type":"paragraph"'),
      undefined,
    );
  });

  test("passes annotation through to repository", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    mockGetSnapshotById.mockReturnValue(createSnapshotFixture());
    mockSaveMessageEdit.mockReturnValue(
      createMessageEditFixture({ annotation: "Fixed typo" }),
    );

    const result = await client.edits.save({
      importId: "import-1",
      snapshotId: "snap-1",
      messageId: "msg-1",
      editedBlocks: [{ type: "paragraph", text: "Edited" }],
      annotation: "Fixed typo",
    });

    expect(result.annotation).toBe("Fixed typo");
    expect(mockSaveMessageEdit).toHaveBeenCalledWith(
      "import-1",
      "snap-1",
      "msg-1",
      expect.any(String),
      "Fixed typo",
    );
  });

  test("throws NOT_FOUND when import does not exist", async () => {
    mockGetImportJob.mockReturnValue(undefined);

    await expect(
      client.edits.save({
        importId: "nonexistent",
        snapshotId: "snap-1",
        messageId: "msg-1",
        editedBlocks: [{ type: "paragraph", text: "x" }],
      }),
    ).rejects.toThrow(ORPCError);
  });

  test("throws NOT_FOUND when snapshot does not belong to the import", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    mockGetSnapshotById.mockReturnValue(
      createSnapshotFixture({ importId: "other-import" }),
    );

    await expect(
      client.edits.save({
        importId: "import-1",
        snapshotId: "snap-1",
        messageId: "msg-1",
        editedBlocks: [{ type: "paragraph", text: "x" }],
      }),
    ).rejects.toThrow(ORPCError);
  });

  test("throws NOT_FOUND when snapshot does not exist", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    mockGetSnapshotById.mockReturnValue(null);

    await expect(
      client.edits.save({
        importId: "import-1",
        snapshotId: "nonexistent-snap",
        messageId: "msg-1",
        editedBlocks: [{ type: "paragraph", text: "x" }],
      }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("edits.delete", () => {
  test("deletes a message edit and returns result", async () => {
    mockGetSnapshotById.mockReturnValue(createSnapshotFixture());
    mockDeleteMessageEdit.mockReturnValue(true);

    const result = await client.edits.delete({
      importId: "import-1",
      snapshotId: "snap-1",
      messageId: "msg-1",
    });

    expect(result).toEqual({ deleted: true });
    expect(mockDeleteMessageEdit).toHaveBeenCalledWith("snap-1", "msg-1");
  });

  test("returns false when edit does not exist", async () => {
    mockGetSnapshotById.mockReturnValue(createSnapshotFixture());
    mockDeleteMessageEdit.mockReturnValue(false);

    const result = await client.edits.delete({
      importId: "import-1",
      snapshotId: "snap-1",
      messageId: "msg-1",
    });

    expect(result).toEqual({ deleted: false });
  });

  test("throws NOT_FOUND when snapshot does not belong to the import", async () => {
    mockGetSnapshotById.mockReturnValue(
      createSnapshotFixture({ importId: "other-import" }),
    );

    await expect(
      client.edits.delete({
        importId: "import-1",
        snapshotId: "snap-1",
        messageId: "msg-1",
      }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("edits.listForSnapshot", () => {
  test("returns edits with parsed blocks", async () => {
    mockListMessageEdits.mockReturnValue([
      createMessageEditFixture(),
      createMessageEditFixture({
        id: "edit-2",
        messageId: "msg-2",
        editedBlocksJson: JSON.stringify([
          { type: "heading", level: 2, text: "Title" },
        ]),
      }),
    ]);

    const result = await client.edits.listForSnapshot({
      snapshotId: "snap-1",
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.editedBlocks).toEqual([
      expect.objectContaining({ type: "paragraph", text: "Edited" }),
    ]);
    expect(result[1]?.editedBlocks).toEqual([
      expect.objectContaining({ type: "heading", level: 2, text: "Title" }),
    ]);
    expect(mockListMessageEdits).toHaveBeenCalledWith("snap-1");
  });

  test("returns empty array when no edits exist", async () => {
    mockListMessageEdits.mockReturnValue([]);

    const result = await client.edits.listForSnapshot({
      snapshotId: "snap-1",
    });

    expect(result).toEqual([]);
  });
});

// --- Snapshots ---

describe("snapshots.list", () => {
  test("returns snapshots for import", async () => {
    const snapshots = [createSnapshotFixture()];
    mockListSnapshots.mockReturnValue(snapshots);

    const result = await client.snapshots.list({ importId: "import-1" });

    expect(result).toEqual(snapshots);
    expect(mockListSnapshots).toHaveBeenCalledWith("import-1");
  });

  test("returns empty array when no snapshots exist", async () => {
    mockListSnapshots.mockReturnValue([]);

    const result = await client.snapshots.list({ importId: "import-1" });

    expect(result).toEqual([]);
  });
});

describe("snapshots.create", () => {
  test("creates a new snapshot", async () => {
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    const snapshot = createSnapshotFixture();
    mockCreateSnapshot.mockReturnValue(snapshot);

    const result = await client.snapshots.create({
      importId: "import-1",
      label: "Draft v1",
    });

    expect(result.id).toBe("snap-1");
    expect(result.label).toBe("Draft v1");
    expect(mockCreateSnapshot).toHaveBeenCalledWith("import-1", "Draft v1");
  });

  test("throws NOT_FOUND when import does not exist", async () => {
    mockGetImportJob.mockReturnValue(undefined);

    await expect(
      client.snapshots.create({ importId: "nonexistent", label: "Test" }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("snapshots.activate", () => {
  test("activates a snapshot", async () => {
    const snapshot = createSnapshotFixture({ isActive: true });
    mockActivateSnapshot.mockReturnValue(snapshot);

    const result = await client.snapshots.activate({
      importId: "import-1",
      snapshotId: "snap-1",
    });

    expect(result.isActive).toBe(true);
    expect(mockActivateSnapshot).toHaveBeenCalledWith("snap-1", "import-1");
  });

  test("throws NOT_FOUND when snapshot does not belong to the import", async () => {
    mockActivateSnapshot.mockImplementation(() => {
      throw new Error("Snapshot snap-1 does not belong to import import-1");
    });

    await expect(
      client.snapshots.activate({
        importId: "import-1",
        snapshotId: "snap-1",
      }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("snapshots.deactivate", () => {
  test("deactivates all snapshots for import", async () => {
    mockDeactivateAllSnapshots.mockReturnValue(undefined);

    const result = await client.snapshots.deactivate({
      importId: "import-1",
    });

    expect(result).toEqual({ deactivated: true });
    expect(mockDeactivateAllSnapshots).toHaveBeenCalledWith("import-1");
  });
});

describe("snapshots.delete", () => {
  test("deletes a snapshot", async () => {
    mockDeleteSnapshot.mockReturnValue(true);

    const result = await client.snapshots.delete({
      importId: "import-1",
      snapshotId: "snap-1",
    });

    expect(result).toEqual({ deleted: true });
    expect(mockDeleteSnapshot).toHaveBeenCalledWith("snap-1", "import-1");
  });

  test("returns false when snapshot does not exist", async () => {
    mockDeleteSnapshot.mockReturnValue(false);

    const result = await client.snapshots.delete({
      importId: "import-1",
      snapshotId: "nonexistent",
    });

    expect(result).toEqual({ deleted: false });
  });
});

describe("snapshots.rename", () => {
  test("renames a snapshot", async () => {
    const snapshot = createSnapshotFixture({ label: "New name" });
    mockRenameSnapshot.mockReturnValue(snapshot);

    const result = await client.snapshots.rename({
      importId: "import-1",
      snapshotId: "snap-1",
      label: "New name",
    });

    expect(result.label).toBe("New name");
    expect(mockRenameSnapshot).toHaveBeenCalledWith(
      "snap-1",
      "import-1",
      "New name",
    );
  });
});
