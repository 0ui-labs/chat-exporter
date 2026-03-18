import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";

import { db } from "../db/client.js";
import {
  adjustmentEvents,
  adjustmentSessions,
  formatRules,
  imports,
} from "../db/schema.js";
import {
  createAdjustmentSession,
  createFormatRuleDirect,
  listSessionEvents,
  recordAdjustmentEvent,
} from "./adjustment-repository.js";

// --- Test helpers ---

const createdImportIds: string[] = [];
const createdSessionIds: string[] = [];
const createdRuleIds: string[] = [];

function insertTestImport(id: string) {
  db.insert(imports)
    .values({
      id,
      sourceUrl: "https://chatgpt.com/share/test",
      sourcePlatform: "chatgpt",
      mode: "archive",
      status: "completed",
      currentStage: "done",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      warningsJson: "[]",
    })
    .run();
  createdImportIds.push(id);
}

afterEach(() => {
  // Clean up in correct FK order: events → rules → sessions → imports
  for (const sid of createdSessionIds) {
    db.delete(adjustmentEvents)
      .where(eq(adjustmentEvents.sessionId, sid))
      .run();
  }
  for (const rid of createdRuleIds) {
    db.delete(formatRules).where(eq(formatRules.id, rid)).run();
  }
  for (const sid of createdSessionIds) {
    db.delete(adjustmentSessions).where(eq(adjustmentSessions.id, sid)).run();
  }
  for (const iid of createdImportIds) {
    db.delete(adjustmentEvents).where(eq(adjustmentEvents.importId, iid)).run();
    db.delete(imports).where(eq(imports.id, iid)).run();
  }
  createdImportIds.length = 0;
  createdSessionIds.length = 0;
  createdRuleIds.length = 0;
});

let sessionCounter = 0;

function createTestSession(importId: string) {
  sessionCounter++;
  const { session } = createAdjustmentSession({
    importId,
    selection: {
      blockIndex: sessionCounter,
      blockType: "paragraph",
      messageId: `msg-${sessionCounter}`,
      messageIndex: sessionCounter,
      messageRole: "assistant",
      selectedText: `Test content ${sessionCounter}`,
      textQuote: `Test content ${sessionCounter}`,
    },
    targetFormat: "reader",
  });
  createdSessionIds.push(session.id);
  return session;
}

function createTestRule(importId: string, sessionId: string) {
  const rule = createFormatRuleDirect({
    importId,
    targetFormat: "reader",
    selector: { blockType: "paragraph", strategy: "block_type" },
    effect: { type: "custom_style", containerStyle: { fontSize: "1.25rem" } },
    instruction: "Make text bigger",
    sourceSessionId: sessionId,
  });
  createdRuleIds.push(rule.id);
  return rule;
}

describe("listSessionEvents", () => {
  test("returns empty array when no events exist for session", () => {
    const events = listSessionEvents("non-existent-session-id");

    expect(events).toEqual([]);
  });

  test("returns events filtered by sessionId", () => {
    insertTestImport("lse-imp-1");
    const sessionA = createTestSession("lse-imp-1");
    const sessionB = createTestSession("lse-imp-1");

    // createAdjustmentSession already records a session_created event per session
    // Add additional events without ruleId (no FK needed)
    recordAdjustmentEvent({
      importId: "lse-imp-1",
      sessionId: sessionA.id,
      targetFormat: "reader",
      type: "preview_generated",
    });
    recordAdjustmentEvent({
      importId: "lse-imp-1",
      sessionId: sessionA.id,
      targetFormat: "reader",
      type: "clarification_requested",
    });

    const eventsA = listSessionEvents(sessionA.id);
    const eventsB = listSessionEvents(sessionB.id);

    // sessionA: session_created + preview_generated + clarification_requested
    expect(eventsA).toHaveLength(3);
    // sessionB: only session_created
    expect(eventsB).toHaveLength(1);
  });

  test("returns events in chronological order", () => {
    insertTestImport("lse-imp-2");
    const session = createTestSession("lse-imp-2");

    recordAdjustmentEvent({
      importId: "lse-imp-2",
      sessionId: session.id,
      targetFormat: "reader",
      type: "preview_generated",
    });
    recordAdjustmentEvent({
      importId: "lse-imp-2",
      sessionId: session.id,
      targetFormat: "reader",
      type: "clarification_requested",
    });

    const events = listSessionEvents(session.id);

    expect(events.length).toBeGreaterThanOrEqual(3);
    const timestamps = events.map((e) => e.createdAt);
    const sorted = [...timestamps].sort();
    expect(timestamps).toEqual(sorted);
  });

  test("includes eventType, ruleId, and createdAt per event", () => {
    insertTestImport("lse-imp-3");
    const session = createTestSession("lse-imp-3");
    const rule = createTestRule("lse-imp-3", session.id);

    // rule_applied event was already recorded by createFormatRuleDirect
    const events = listSessionEvents(session.id);
    const ruleEvent = events.find((e) => e.eventType === "rule_applied");

    expect(ruleEvent).toBeDefined();
    if (!ruleEvent) throw new Error("unreachable");
    expect(ruleEvent.ruleId).toBe(rule.id);
    expect(ruleEvent.eventType).toBe("rule_applied");
    expect(ruleEvent.createdAt).toBeTruthy();
  });

  test("returns events with null ruleId for non-rule events", () => {
    insertTestImport("lse-imp-4");
    const session = createTestSession("lse-imp-4");

    const events = listSessionEvents(session.id);
    const sessionCreatedEvent = events.find(
      (e) => e.eventType === "session_created",
    );

    expect(sessionCreatedEvent).toBeDefined();
    if (!sessionCreatedEvent) throw new Error("unreachable");
    expect(sessionCreatedEvent.ruleId).toBeNull();
  });
});
