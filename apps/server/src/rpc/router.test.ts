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
  saveAdjustmentPreview: vi.fn(),
  applyAdjustmentPreview: vi.fn(),
  discardAdjustmentSession: vi.fn(),
  recordAdjustmentEvent: vi.fn(),
  reopenAdjustmentSession: vi.fn(),
}));

vi.mock("../lib/adjustment-preview.js", () => ({
  buildAdjustmentPreview: vi.fn(),
}));

vi.mock("../lib/adjustment-chat-orchestrator.js", () => ({
  runAdjustmentChatTurn: vi.fn(),
  AdjustmentChatUnavailableError: class AdjustmentChatUnavailableError extends Error {},
}));

vi.mock("../db/client.js", () => ({
  databasePath: "/test/chat-exporter.db",
  db: {},
  rawDb: {},
  withTransaction: (fn: () => unknown) => fn(),
}));

import { createRouterClient, ORPCError } from "@orpc/server";
import { runAdjustmentChatTurn } from "../lib/adjustment-chat-orchestrator.js";
import { buildAdjustmentPreview } from "../lib/adjustment-preview.js";
import {
  appendAdjustmentMessage,
  applyAdjustmentPreview,
  createAdjustmentSession,
  disableFormatRule,
  discardAdjustmentSession,
  getAdjustmentMetrics,
  getAdjustmentSessionDetail,
  listAdjustmentSessions,
  listFormatRules,
  recordAdjustmentEvent,
  reopenAdjustmentSession,
  saveAdjustmentPreview,
} from "../lib/adjustment-repository.js";
import { getPersistedImportSnapshot } from "../lib/import-repository.js";
import {
  createImportJob,
  getImportJob,
  listImportJobs,
  runImportJob,
} from "../lib/import-store.js";
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
const mockApplyAdjustmentPreview = applyAdjustmentPreview as ReturnType<
  typeof vi.fn
>;
const mockDiscardAdjustmentSession = discardAdjustmentSession as ReturnType<
  typeof vi.fn
>;
const mockBuildAdjustmentPreview = buildAdjustmentPreview as ReturnType<
  typeof vi.fn
>;
const mockRunAdjustmentChatTurn = runAdjustmentChatTurn as ReturnType<
  typeof vi.fn
>;
const mockSaveAdjustmentPreview = saveAdjustmentPreview as ReturnType<
  typeof vi.fn
>;
const mockRecordAdjustmentEvent = recordAdjustmentEvent as ReturnType<
  typeof vi.fn
>;
const _mockReopenAdjustmentSession = reopenAdjustmentSession as ReturnType<
  typeof vi.fn
>;

function createImportJobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "import-1",
    sourceUrl: "https://chatgpt.com/share/abc",
    sourcePlatform: "chatgpt",
    mode: "archive",
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
  test("returns all import jobs", async () => {
    const jobs = [createImportJobFixture()];
    mockListImportJobs.mockReturnValue(jobs);

    const result = await client.imports.list();

    expect(result).toEqual(jobs);
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

describe("adjustments.generatePreview", () => {
  test("builds and saves preview", async () => {
    const detail = createSessionDetailFixture();
    mockGetAdjustmentSessionDetail.mockReturnValue(detail);
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    mockListFormatRules.mockReturnValue([]);
    mockBuildAdjustmentPreview.mockResolvedValue({
      targetFormat: "markdown",
      summary: "Test preview",
      rationale: "Test rationale",
      limitations: [],
      draftRule: {
        kind: "render",
        scope: "import_local",
        selector: { strategy: "block_type", blockType: "paragraph" },
        effect: {
          type: "adjust_block_spacing",
          direction: "after",
          amount: "lg",
        },
      },
    });

    const updatedDetail = createSessionDetailFixture({
      session: { ...detail.session, status: "preview_ready" },
    });
    mockGetAdjustmentSessionDetail
      .mockReturnValueOnce(detail)
      .mockReturnValueOnce(updatedDetail);

    const result = await client.adjustments.generatePreview({
      sessionId: "session-1",
    });

    expect(mockBuildAdjustmentPreview).toHaveBeenCalledOnce();
    expect(mockSaveAdjustmentPreview).toHaveBeenCalledOnce();
    expect(mockRecordAdjustmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "preview_generated" }),
    );
    expect(result.session.id).toBe("session-1");
  });

  test("throws NOT_FOUND when session does not exist", async () => {
    mockGetAdjustmentSessionDetail.mockReturnValue(undefined);

    await expect(
      client.adjustments.generatePreview({ sessionId: "nonexistent" }),
    ).rejects.toThrow(ORPCError);
  });
});

describe("adjustments.apply", () => {
  test("applies adjustment preview", async () => {
    const applyResult = {
      session: { ...createSessionDetailFixture().session, status: "applied" },
      rule: {
        id: "rule-1",
        importId: "import-1",
        targetFormat: "markdown",
        kind: "render",
        scope: "import_local",
        status: "active",
        selector: { strategy: "block_type", blockType: "paragraph" },
        instruction: "Test",
        compiledRule: {
          type: "adjust_block_spacing",
          direction: "after",
          amount: "lg",
        },
        sourceSessionId: "session-1",
        createdAt: "2026-03-08T12:00:00.000Z",
        updatedAt: "2026-03-08T12:00:00.000Z",
      },
    };
    mockApplyAdjustmentPreview.mockReturnValue(applyResult);

    const result = await client.adjustments.apply({ sessionId: "session-1" });

    expect(result.rule.id).toBe("rule-1");
    expect(mockApplyAdjustmentPreview).toHaveBeenCalledWith("session-1");
  });

  test("throws BAD_REQUEST when apply fails", async () => {
    mockApplyAdjustmentPreview.mockImplementation(() => {
      throw new Error("Erzeuge zuerst eine Vorschau.");
    });

    await expect(
      client.adjustments.apply({ sessionId: "session-1" }),
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
    expect(mockDisableFormatRule).toHaveBeenCalledWith("rule-1");
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
  test("appends user message and runs AI chat turn", async () => {
    const detail = createSessionDetailFixture();
    mockGetAdjustmentSessionDetail.mockReturnValue(detail);
    mockGetImportJob.mockReturnValue(createImportJobFixture());
    mockListFormatRules.mockReturnValue([]);
    mockRunAdjustmentChatTurn.mockResolvedValue({
      assistantMessage: "AI response",
      toolMessages: [],
      didRequestClarification: false,
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
    expect(mockRunAdjustmentChatTurn).toHaveBeenCalledOnce();
    expect(result.messages).toHaveLength(2);
  });
});
