import { describe, expect, test } from "vitest";
import type {
  ActivateSnapshotRequest,
  ConversationSnapshot,
  CreateSnapshotRequest,
  DeleteMessageEditRequest,
  MessageEdit,
  RenameSnapshotRequest,
  ResolvedMessage,
  SaveMessageEditRequest,
} from "../edits.js";
import {
  activateSnapshotRequestSchema,
  conversationSnapshotSchema,
  createSnapshotRequestSchema,
  deleteMessageEditRequestSchema,
  messageEditSchema,
  renameSnapshotRequestSchema,
  resolvedMessageSchema,
  saveMessageEditRequestSchema,
} from "../edits.js";

// --- Fixtures ---

const validSnapshot = {
  id: "snap-1",
  importId: "imp-1",
  label: "Draft v1",
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const validMessageEdit = {
  id: "edit-1",
  importId: "imp-1",
  snapshotId: "snap-1",
  messageId: "msg-1",
  editedBlocks: [{ type: "paragraph" as const, text: "Hello world" }],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const validBlocks = [
  { type: "paragraph" as const, text: "Hello world" },
  { type: "heading" as const, level: 2, text: "Section" },
];

// --- conversationSnapshotSchema ---

describe("conversationSnapshotSchema", () => {
  test("accepts a valid snapshot", () => {
    const result = conversationSnapshotSchema.safeParse(validSnapshot);

    expect(result.success).toBe(true);
  });

  test("accepts snapshot with isActive false", () => {
    const result = conversationSnapshotSchema.safeParse({
      ...validSnapshot,
      isActive: false,
    });

    expect(result.success).toBe(true);
  });

  test.each([
    ["missing id", { ...validSnapshot, id: undefined }],
    ["missing importId", { ...validSnapshot, importId: undefined }],
    ["missing label", { ...validSnapshot, label: undefined }],
    ["missing isActive", { ...validSnapshot, isActive: undefined }],
    ["missing createdAt", { ...validSnapshot, createdAt: undefined }],
    ["missing updatedAt", { ...validSnapshot, updatedAt: undefined }],
    ["wrong type for isActive", { ...validSnapshot, isActive: "yes" }],
    ["wrong type for label", { ...validSnapshot, label: 123 }],
  ])("rejects invalid snapshot: %s", (_label, payload) => {
    const result = conversationSnapshotSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

// --- messageEditSchema ---

describe("messageEditSchema", () => {
  test("accepts a valid message edit without annotation", () => {
    const result = messageEditSchema.safeParse(validMessageEdit);

    expect(result.success).toBe(true);
  });

  test("accepts a valid message edit with annotation", () => {
    const result = messageEditSchema.safeParse({
      ...validMessageEdit,
      annotation: "Fixed typo",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.annotation).toBe("Fixed typo");
    }
  });

  test("accepts a valid message edit with multiple blocks", () => {
    const result = messageEditSchema.safeParse({
      ...validMessageEdit,
      editedBlocks: validBlocks,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.editedBlocks).toHaveLength(2);
    }
  });

  test.each([
    ["missing id", { ...validMessageEdit, id: undefined }],
    ["missing importId", { ...validMessageEdit, importId: undefined }],
    ["missing snapshotId", { ...validMessageEdit, snapshotId: undefined }],
    ["missing messageId", { ...validMessageEdit, messageId: undefined }],
    ["missing editedBlocks", { ...validMessageEdit, editedBlocks: undefined }],
    ["missing createdAt", { ...validMessageEdit, createdAt: undefined }],
    ["wrong type for annotation", { ...validMessageEdit, annotation: 42 }],
    [
      "invalid block type in editedBlocks",
      { ...validMessageEdit, editedBlocks: [{ type: "unknown", text: "x" }] },
    ],
  ])("rejects invalid message edit: %s", (_label, payload) => {
    const result = messageEditSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

// --- saveMessageEditRequestSchema ---

describe("saveMessageEditRequestSchema", () => {
  const validRequest = {
    importId: "imp-1",
    snapshotId: "snap-1",
    messageId: "msg-1",
    editedBlocks: validBlocks,
  };

  test("accepts valid request without annotation", () => {
    const result = saveMessageEditRequestSchema.safeParse(validRequest);

    expect(result.success).toBe(true);
  });

  test("accepts valid request with annotation", () => {
    const result = saveMessageEditRequestSchema.safeParse({
      ...validRequest,
      annotation: "Improved clarity",
    });

    expect(result.success).toBe(true);
  });

  test("accepts request with various block types", () => {
    const result = saveMessageEditRequestSchema.safeParse({
      ...validRequest,
      editedBlocks: [
        { type: "paragraph", text: "intro" },
        { type: "code", language: "ts", text: "const x = 1" },
        { type: "list", ordered: true, items: ["a", "b"] },
        { type: "quote", text: "wise words" },
        { type: "table", headers: ["A"], rows: [["1"]] },
      ],
    });

    expect(result.success).toBe(true);
  });

  test.each([
    ["missing importId", { ...validRequest, importId: undefined }],
    ["missing snapshotId", { ...validRequest, snapshotId: undefined }],
    ["missing messageId", { ...validRequest, messageId: undefined }],
    ["missing editedBlocks", { ...validRequest, editedBlocks: undefined }],
    ["empty editedBlocks is allowed", { ...validRequest, editedBlocks: [] }],
    [
      "invalid block type",
      {
        ...validRequest,
        editedBlocks: [{ type: "unknown", text: "x" }],
      },
    ],
  ])("handles edge case: %s", (_label, payload) => {
    const result = saveMessageEditRequestSchema.safeParse(payload);

    if (_label === "empty editedBlocks is allowed") {
      expect(result.success).toBe(true);
    } else {
      expect(result.success).toBe(false);
    }
  });
});

// --- deleteMessageEditRequestSchema ---

describe("deleteMessageEditRequestSchema", () => {
  test("accepts valid request", () => {
    const result = deleteMessageEditRequestSchema.safeParse({
      importId: "imp-1",
      snapshotId: "snap-1",
      messageId: "msg-1",
    });

    expect(result.success).toBe(true);
  });

  test.each([
    ["missing importId", { snapshotId: "s", messageId: "m" }],
    ["missing snapshotId", { importId: "i", messageId: "m" }],
    ["missing messageId", { importId: "i", snapshotId: "s" }],
  ])("rejects invalid request: %s", (_label, payload) => {
    const result = deleteMessageEditRequestSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

// --- createSnapshotRequestSchema ---

describe("createSnapshotRequestSchema", () => {
  test("accepts valid request", () => {
    const result = createSnapshotRequestSchema.safeParse({
      importId: "imp-1",
      label: "My Snapshot",
    });

    expect(result.success).toBe(true);
  });

  test.each([
    ["missing importId", { label: "x" }],
    ["missing label", { importId: "i" }],
    ["wrong type for label", { importId: "i", label: 42 }],
  ])("rejects invalid request: %s", (_label, payload) => {
    const result = createSnapshotRequestSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

// --- activateSnapshotRequestSchema ---

describe("activateSnapshotRequestSchema", () => {
  test("accepts valid request", () => {
    const result = activateSnapshotRequestSchema.safeParse({
      importId: "imp-1",
      snapshotId: "snap-1",
    });

    expect(result.success).toBe(true);
  });

  test("rejects missing snapshotId", () => {
    const result = activateSnapshotRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});

// --- renameSnapshotRequestSchema ---

describe("renameSnapshotRequestSchema", () => {
  test("accepts valid request", () => {
    const result = renameSnapshotRequestSchema.safeParse({
      importId: "imp-1",
      snapshotId: "snap-1",
      label: "New name",
    });

    expect(result.success).toBe(true);
  });

  test.each([
    ["missing snapshotId", { label: "x" }],
    ["missing label", { snapshotId: "s" }],
  ])("rejects invalid request: %s", (_label, payload) => {
    const result = renameSnapshotRequestSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

// --- resolvedMessageSchema ---

describe("resolvedMessageSchema", () => {
  test("accepts valid resolved message", () => {
    const result = resolvedMessageSchema.safeParse({
      messageId: "msg-1",
      blocks: validBlocks,
      isEdited: true,
    });

    expect(result.success).toBe(true);
  });

  test("accepts unedited resolved message", () => {
    const result = resolvedMessageSchema.safeParse({
      messageId: "msg-1",
      blocks: [],
      isEdited: false,
    });

    expect(result.success).toBe(true);
  });

  test.each([
    ["missing messageId", { blocks: [], isEdited: false }],
    ["missing blocks", { messageId: "m", isEdited: false }],
    ["missing isEdited", { messageId: "m", blocks: [] }],
    ["wrong type for isEdited", { messageId: "m", blocks: [], isEdited: "no" }],
  ])("rejects invalid resolved message: %s", (_label, payload) => {
    const result = resolvedMessageSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

// --- Type inference smoke tests ---

describe("type inference", () => {
  test("inferred types are assignable", () => {
    const snapshot: ConversationSnapshot = {
      id: "s",
      importId: "i",
      label: "l",
      isActive: true,
      createdAt: "c",
      updatedAt: "u",
    };

    const edit: MessageEdit = {
      id: "e",
      importId: "i",
      snapshotId: "s",
      messageId: "m",
      editedBlocks: [{ type: "paragraph", text: "t" }],
      createdAt: "c",
      updatedAt: "u",
    };

    const saveReq: SaveMessageEditRequest = {
      importId: "i",
      snapshotId: "s",
      messageId: "m",
      editedBlocks: [{ type: "paragraph", text: "t" }],
    };

    const deleteReq: DeleteMessageEditRequest = {
      importId: "i",
      snapshotId: "s",
      messageId: "m",
    };

    const createReq: CreateSnapshotRequest = {
      importId: "i",
      label: "l",
    };

    const activateReq: ActivateSnapshotRequest = {
      importId: "i",
      snapshotId: "s",
    };

    const renameReq: RenameSnapshotRequest = {
      importId: "i",
      snapshotId: "s",
      label: "l",
    };

    const resolved: ResolvedMessage = {
      messageId: "m",
      blocks: [],
      isEdited: false,
    };

    // All variables should be defined (type check passes if code compiles)
    expect(snapshot).toBeDefined();
    expect(edit).toBeDefined();
    expect(saveReq).toBeDefined();
    expect(deleteReq).toBeDefined();
    expect(createReq).toBeDefined();
    expect(activateReq).toBeDefined();
    expect(renameReq).toBeDefined();
    expect(resolved).toBeDefined();
  });
});
