import type {
  AdjustmentSelection,
  AdjustmentSessionDetail,
  Role,
} from "@chat-exporter/shared";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  _internal,
  AgentUnavailableError,
  runAgentTurn,
} from "./adjustment-agent.js";

// --- Env setup ---

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function setTestEnv() {
  process.env.ADJUSTMENT_RULE_COMPILATION_ENABLED = "1";
  process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "openai";
  process.env.ADJUSTMENT_RULE_COMPILATION_MODEL = "gpt-5-mini";
  process.env.OPENAI_API_BASE_URL = "https://example.test/v1";
  process.env.OPENAI_API_KEY = "test-key";
}

// --- Factories ---

function createSelection(
  overrides: Partial<AdjustmentSelection> = {},
): AdjustmentSelection {
  return {
    blockIndex: 0,
    blockType: "paragraph",
    messageId: "message-1",
    messageIndex: 0,
    messageRole: "assistant",
    selectedText: "Example content",
    textQuote: "Example content",
    ...overrides,
  };
}

function createSessionDetail(
  userMessage = "Mach den Text größer",
): AdjustmentSessionDetail {
  return {
    messages: [
      {
        content: "Wie kann ich helfen?",
        createdAt: "2026-03-08T12:00:00.000Z",
        id: "assistant-1",
        role: "assistant" satisfies Role,
        sessionId: "session-1",
      },
      {
        content: userMessage,
        createdAt: "2026-03-08T12:01:00.000Z",
        id: "user-1",
        role: "user" satisfies Role,
        sessionId: "session-1",
      },
    ],
    session: {
      createdAt: "2026-03-08T12:00:00.000Z",
      id: "session-1",
      importId: "import-1",
      selection: createSelection(),
      status: "open",
      targetFormat: "reader",
      updatedAt: "2026-03-08T12:01:00.000Z",
    },
  };
}

function createCallbacks() {
  return {
    onCreateRule: vi.fn().mockResolvedValue({ ruleId: "rule-new-1" }),
    onUpdateRule: vi.fn().mockResolvedValue(undefined),
    onDeleteRule: vi.fn().mockResolvedValue(undefined),
  };
}

/** Creates a session with multiple user messages (simulates later turns). */
function createMultiTurnSessionDetail(): AdjustmentSessionDetail {
  return {
    messages: [
      {
        content: "Wie kann ich helfen?",
        createdAt: "2026-03-08T12:00:00.000Z",
        id: "assistant-1",
        role: "assistant" satisfies Role,
        sessionId: "session-1",
      },
      {
        content: "Mach den Text größer",
        createdAt: "2026-03-08T12:01:00.000Z",
        id: "user-1",
        role: "user" satisfies Role,
        sessionId: "session-1",
      },
      {
        content: "Die Schriftgröße wurde angepasst.",
        createdAt: "2026-03-08T12:02:00.000Z",
        id: "assistant-2",
        role: "assistant" satisfies Role,
        sessionId: "session-1",
      },
      {
        content: "Jetzt noch fetter bitte",
        createdAt: "2026-03-08T12:03:00.000Z",
        id: "user-2",
        role: "user" satisfies Role,
        sessionId: "session-1",
      },
    ],
    session: {
      createdAt: "2026-03-08T12:00:00.000Z",
      id: "session-1",
      importId: "import-1",
      selection: createSelection(),
      status: "open",
      targetFormat: "reader",
      updatedAt: "2026-03-08T12:03:00.000Z",
    },
  };
}

// --- OpenAI mock helper ---

function mockResponsesApi(output: unknown[]) {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ id: "resp-1", output, output_text: null }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
}

function functionCallOutput(
  name: string,
  args: Record<string, unknown>,
  callId = "call-1",
) {
  return {
    type: "function_call",
    call_id: callId,
    name,
    arguments: JSON.stringify(args),
  };
}

function assistantMessageOutput(text: string) {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

describe("AdjustmentAgent", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  test("AI calls create_rule with CSS effect → callback receives validated effect", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    const createRuleArgs = {
      selector: {
        strategy: "exact",
        messageId: "message-1",
        blockIndex: 0,
        blockType: "paragraph",
      },
      effect: {
        type: "custom_style",
        textStyle: { fontSize: "1.25rem", fontWeight: "600" },
      },
      description: "Text größer und fetter machen",
    };

    // First call: AI returns function_call
    // Second call: AI returns assistant message after tool output
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [functionCallOutput("create_rule", createRuleArgs)],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [
              assistantMessageOutput("Der Text ist jetzt größer und fetter."),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(callbacks.onCreateRule).toHaveBeenCalledOnce();
    expect(callbacks.onCreateRule).toHaveBeenCalledWith({
      selector: createRuleArgs.selector,
      effect: {
        type: "custom_style",
        textStyle: { fontSize: "1.25rem", fontWeight: "600" },
      },
      description: "Text größer und fetter machen",
    });
    expect(result.actions).toEqual([{ type: "created", ruleId: "rule-new-1" }]);
    expect(result.assistantMessage).toBe(
      "Der Text ist jetzt größer und fetter.",
    );
  });

  test("AI calls update_rule → callback receives ruleId and effect", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    const updateRuleArgs = {
      ruleId: "rule-existing-1",
      effect: {
        type: "custom_style",
        textStyle: { fontSize: "1.5rem" },
      },
      description: "Noch größer",
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [functionCallOutput("update_rule", updateRuleArgs)],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [assistantMessageOutput("Schriftgröße wurde erhöht.")],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(callbacks.onUpdateRule).toHaveBeenCalledOnce();
    expect(callbacks.onUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-existing-1",
      effect: { type: "custom_style", textStyle: { fontSize: "1.5rem" } },
      description: "Noch größer",
    });
    expect(result.actions).toEqual([
      { type: "updated", ruleId: "rule-existing-1" },
    ]);
  });

  test("AI calls delete_rule → callback receives ruleId", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [
              functionCallOutput("delete_rule", {
                ruleId: "rule-to-delete",
              }),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [assistantMessageOutput("Regel wurde entfernt.")],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(callbacks.onDeleteRule).toHaveBeenCalledOnce();
    expect(callbacks.onDeleteRule).toHaveBeenCalledWith("rule-to-delete");
    expect(result.actions).toEqual([
      { type: "deleted", ruleId: "rule-to-delete" },
    ]);
  });

  test("AI asks clarification question → no callbacks, only assistantMessage", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    globalThis.fetch = mockResponsesApi([
      assistantMessageOutput("Möchtest du den Text größer oder fetter machen?"),
    ]);

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(callbacks.onCreateRule).not.toHaveBeenCalled();
    expect(callbacks.onUpdateRule).not.toHaveBeenCalled();
    expect(callbacks.onDeleteRule).not.toHaveBeenCalled();
    expect(result.actions).toEqual([]);
    expect(result.assistantMessage).toBe(
      "Möchtest du den Text größer oder fetter machen?",
    );
  });

  test("AI sends invalid effect → Zod validation catches it, error returned as tool result", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    const invalidArgs = {
      selector: {
        strategy: "exact",
        messageId: "message-1",
        blockIndex: 0,
        blockType: "paragraph",
      },
      effect: {
        type: "not_a_valid_type",
        textStyle: { fontSize: "1rem" },
      },
      description: "Invalid rule",
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [functionCallOutput("create_rule", invalidArgs)],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [
              assistantMessageOutput(
                "Es gab ein Problem mit der Regel. Bitte versuche es erneut.",
              ),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    // Callback should NOT have been called because of validation failure
    expect(callbacks.onCreateRule).not.toHaveBeenCalled();

    // The second fetch call should have received error in tool output
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const secondCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondCall[1].body)) as {
      input: Array<{ output?: string }>;
    };
    const toolOutput = secondBody.input[0]?.output;
    expect(toolOutput).toBeDefined();
    expect(toolOutput).toMatch(/error/i);

    // Agent should still return a message
    expect(result.assistantMessage).toBeTruthy();
  });

  test("AI calls multiple tools in one round → all are processed", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    const createArgs = {
      selector: {
        strategy: "exact",
        messageId: "message-1",
        blockIndex: 0,
        blockType: "paragraph",
      },
      effect: {
        type: "custom_style",
        textStyle: { fontSize: "1.25rem" },
      },
      description: "Größere Schrift",
    };

    const deleteArgs = {
      ruleId: "old-rule-1",
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [
              functionCallOutput("create_rule", createArgs, "call-create"),
              functionCallOutput("delete_rule", deleteArgs, "call-delete"),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [
              assistantMessageOutput("Neue Regel erstellt und alte entfernt."),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(callbacks.onCreateRule).toHaveBeenCalledOnce();
    expect(callbacks.onDeleteRule).toHaveBeenCalledOnce();
    expect(result.actions).toHaveLength(2);
    expect(result.actions).toContainEqual({
      type: "created",
      ruleId: "rule-new-1",
    });
    expect(result.actions).toContainEqual({
      type: "deleted",
      ruleId: "old-rule-1",
    });
  });

  test("empty AI response triggers retry with nudge instead of generic fallback", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    // First call: AI returns no text and no function calls (empty output)
    // Second call (retry with nudge): AI returns a concrete question
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [
              assistantMessageOutput(
                "Möchtest du die Einrückung nur für diese Liste oder für alle Listen ändern?",
              ),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail("kannst du Listen weiter einrücken"),
      activeRules: [],
      callbacks,
    });

    expect(callbacks.onCreateRule).not.toHaveBeenCalled();
    expect(result.actions).toEqual([]);
    // Should get the concrete question from the retry, not the old generic fallback
    expect(result.assistantMessage).toBe(
      "Möchtest du die Einrückung nur für diese Liste oder für alle Listen ändern?",
    );
    // Should have made 2 fetch calls: original + retry
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Verify the retry request has tool_choice: "none" to force text output
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const retryCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const retryBody = JSON.parse(String(retryCall[1].body)) as {
      tool_choice?: string;
    };
    expect(retryBody.tool_choice).toBe("none");
  });

  test("empty AI response with failed retry uses helpful fallback message", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    // Both calls return empty output
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(result.assistantMessage).toBe(
      "Ich konnte die Anfrage nicht verstehen. Kannst du bitte genauer beschreiben, was du ändern möchtest?",
    );
  });

  test("hallucination guard: AI message without tool actions and no question mark → fallback", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    // AI returns a confident statement without calling any tools
    globalThis.fetch = mockResponsesApi([
      assistantMessageOutput("Die Schriftgröße wurde angepasst."),
    ]);

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(callbacks.onCreateRule).not.toHaveBeenCalled();
    expect(result.actions).toEqual([]);
    expect(result.assistantMessage).toBe(
      "Ich konnte die Änderung leider nicht umsetzen. Kannst du genauer beschreiben, was du ändern möchtest?",
    );
  });

  test("hallucination guard: AI message without tool actions but with question mark → kept as clarification", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    globalThis.fetch = mockResponsesApi([
      assistantMessageOutput("Möchtest du den Text größer oder fetter machen?"),
    ]);

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(result.actions).toEqual([]);
    expect(result.assistantMessage).toBe(
      "Möchtest du den Text größer oder fetter machen?",
    );
  });

  test("hallucination guard: AI message with tool actions → message kept as-is", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    const createArgs = {
      selector: {
        strategy: "exact",
        messageId: "message-1",
        blockIndex: 0,
        blockType: "paragraph",
      },
      effect: {
        type: "custom_style",
        textStyle: { fontSize: "1.25rem" },
      },
      description: "Größere Schrift",
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [functionCallOutput("create_rule", createArgs)],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [
              assistantMessageOutput("Die Schriftgröße wurde angepasst."),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    expect(result.actions).toHaveLength(1);
    // Message is kept because there ARE tool actions
    expect(result.assistantMessage).toBe("Die Schriftgröße wurde angepasst.");
  });

  test("sends reasoning effort 'medium' in the request body", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    globalThis.fetch = mockResponsesApi([
      assistantMessageOutput("Alles klar."),
    ]);

    await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body)) as {
      reasoning?: { effort?: string };
    };

    expect(body.reasoning).toBeDefined();
    expect(body.reasoning?.effort).toBe("medium");
  });

  test("throws AgentUnavailableError when AI is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    delete process.env.ADJUSTMENT_RULE_COMPILATION_ENABLED;
    delete process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER;

    await expect(
      runAgentTurn({
        sessionDetail: createSessionDetail(),
        activeRules: [],
        callbacks: createCallbacks(),
      }),
    ).rejects.toThrow(AgentUnavailableError);
  });

  test("callback error is returned as tool result without aborting the turn", async () => {
    setTestEnv();
    const callbacks = createCallbacks();
    callbacks.onCreateRule.mockRejectedValueOnce(
      new Error("Database constraint violation"),
    );

    const createArgs = {
      selector: {
        strategy: "exact",
        messageId: "message-1",
        blockIndex: 0,
        blockType: "paragraph",
      },
      effect: {
        type: "custom_style",
        textStyle: { fontSize: "1rem" },
      },
      description: "Test rule",
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [functionCallOutput("create_rule", createArgs)],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [
              assistantMessageOutput("Es gab ein Problem beim Erstellen."),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    // The second fetch should have received the error as tool output
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const secondCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondCall[1].body)) as {
      input: Array<{ output?: string }>;
    };
    const toolOutput = secondBody.input[0]?.output;
    expect(toolOutput).toMatch(/Database constraint violation/);

    // Agent should still return
    expect(result.assistantMessage).toBeTruthy();
  });

  test("first turn (1 user message) sends tool_choice 'required'", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    globalThis.fetch = mockResponsesApi([
      assistantMessageOutput("Wie soll ich das ändern?"),
    ]);

    await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body)) as {
      tool_choice?: string;
    };

    expect(body.tool_choice).toBe("required");
  });

  test("later turns (>1 user messages) sends tool_choice 'auto'", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    globalThis.fetch = mockResponsesApi([
      assistantMessageOutput("Wie soll ich das ändern?"),
    ]);

    await runAgentTurn({
      sessionDetail: createMultiTurnSessionDetail(),
      activeRules: [],
      callbacks,
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(firstCall[1].body)) as {
      tool_choice?: string;
    };

    expect(body.tool_choice).toBe("auto");
  });

  test("tool loop follow-up calls use tool_choice 'auto' even on first turn", async () => {
    setTestEnv();
    const callbacks = createCallbacks();

    const createArgs = {
      selector: {
        strategy: "exact",
        messageId: "message-1",
        blockIndex: 0,
        blockType: "paragraph",
      },
      effect: {
        type: "custom_style",
        textStyle: { fontSize: "1.25rem" },
      },
      description: "Größere Schrift",
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [functionCallOutput("create_rule", createArgs)],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp-2",
            output: [
              assistantMessageOutput("Die Schriftgröße wurde angepasst."),
            ],
            output_text: null,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    await runAgentTurn({
      sessionDetail: createSessionDetail(),
      activeRules: [],
      callbacks,
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    // First call should be "required" (first turn)
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const firstBody = JSON.parse(String(firstCall[1].body)) as {
      tool_choice?: string;
    };
    expect(firstBody.tool_choice).toBe("required");

    // Second call (tool loop follow-up) should be "auto"
    const secondCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondCall[1].body)) as {
      tool_choice?: string;
    };
    expect(secondBody.tool_choice).toBe("auto");
  });
});

describe("buildSelectorSchema", () => {
  test("includes compound in strategy enum", () => {
    const schema = _internal.buildSelectorSchema();

    expect(schema.properties.strategy.enum).toContain("compound");
  });

  test("includes messageRole, headingLevel, position, textPattern, context properties", () => {
    const schema = _internal.buildSelectorSchema();

    expect(schema.properties).toHaveProperty("messageRole");
    expect(schema.properties).toHaveProperty("headingLevel");
    expect(schema.properties).toHaveProperty("position");
    expect(schema.properties).toHaveProperty("textPattern");
    expect(schema.properties).toHaveProperty("context");
  });

  test("messageRole enum contains expected roles", () => {
    const schema = _internal.buildSelectorSchema();
    // buildSelectorSchema() defaults to "reader" format, which always includes messageRole
    const messageRole = schema.properties.messageRole as {
      type: string;
      enum: string[];
    };

    expect(messageRole.enum).toEqual(["user", "assistant", "system", "tool"]);
  });

  test("position enum contains first and last", () => {
    const schema = _internal.buildSelectorSchema();
    // buildSelectorSchema() defaults to "reader" format, which always includes position
    const position = schema.properties.position as {
      type: string;
      enum: string[];
    };

    expect(position.enum).toEqual(["first", "last"]);
  });

  test("context has previousSibling and nextSibling with correct sub-properties", () => {
    const schema = _internal.buildSelectorSchema();
    // buildSelectorSchema() defaults to "reader" format, which always includes context
    const context = schema.properties.context as {
      type: string;
      properties: Record<
        string,
        { type: string; properties: Record<string, unknown> }
      >;
    };

    expect(context.properties).toHaveProperty("previousSibling");
    expect(context.properties).toHaveProperty("nextSibling");
    expect(context.properties.previousSibling?.properties).toHaveProperty(
      "blockType",
    );
    expect(context.properties.previousSibling?.properties).toHaveProperty(
      "headingLevel",
    );
    expect(context.properties.previousSibling?.properties).toHaveProperty(
      "textPattern",
    );
  });

  describe("markdown format — compound selector restrictions", () => {
    test("exposes textPattern for compound selectors", () => {
      // Markdown compound matching is line-based and only textPattern is honored
      // by applyMarkdownRules — textPattern must remain available.
      const schema = _internal.buildSelectorSchema("markdown");

      expect(schema.properties).toHaveProperty("textPattern");
    });

    test("does not expose messageRole for compound selectors", () => {
      // messageRole is a block/message concept that does not exist in the flat
      // line-based Markdown representation and is silently ignored.
      const schema = _internal.buildSelectorSchema("markdown");

      expect(schema.properties).not.toHaveProperty("messageRole");
    });

    test("does not expose headingLevel for compound selectors", () => {
      const schema = _internal.buildSelectorSchema("markdown");

      expect(schema.properties).not.toHaveProperty("headingLevel");
    });

    test("does not expose position for compound selectors", () => {
      const schema = _internal.buildSelectorSchema("markdown");

      expect(schema.properties).not.toHaveProperty("position");
    });

    test("does not expose context (sibling filters) for compound selectors", () => {
      const schema = _internal.buildSelectorSchema("markdown");

      expect(schema.properties).not.toHaveProperty("context");
    });

    test("still includes compound in strategy enum", () => {
      const schema = _internal.buildSelectorSchema("markdown");

      expect(schema.properties.strategy.enum).toContain("compound");
    });
  });

  describe("reader format — all compound selector fields present", () => {
    test("exposes all compound selector fields when format is reader", () => {
      const schema = _internal.buildSelectorSchema("reader");

      expect(schema.properties).toHaveProperty("messageRole");
      expect(schema.properties).toHaveProperty("headingLevel");
      expect(schema.properties).toHaveProperty("position");
      expect(schema.properties).toHaveProperty("textPattern");
      expect(schema.properties).toHaveProperty("context");
    });
  });
});

describe("buildActionHistory", () => {
  function createFormatRule(
    overrides: Partial<import("@chat-exporter/shared").FormatRule> = {},
  ): import("@chat-exporter/shared").FormatRule {
    return {
      id: "rule-1",
      importId: null,
      targetFormat: "reader",
      kind: "render",
      scope: "import_local",
      status: "active",
      selector: { strategy: "block_type", blockType: "paragraph" },
      instruction: "Default instruction",
      createdAt: "2026-03-08T12:00:00.000Z",
      updatedAt: "2026-03-08T12:00:00.000Z",
      ...overrides,
    };
  }

  test("returns empty string for empty event list", () => {
    const result = _internal.buildActionHistory([], []);

    expect(result).toBe("");
  });

  test("maps rule_applied events to rule description", () => {
    const rules = [
      createFormatRule({
        id: "abc-123",
        instruction: "Liste weiter eingerückt",
      }),
      createFormatRule({ id: "def-456", instruction: "Überschrift kleiner" }),
    ];
    const events = [
      {
        eventType: "rule_applied",
        ruleId: "abc-123",
        createdAt: "2026-03-08T12:01:00.000Z",
      },
      {
        eventType: "rule_applied",
        ruleId: "def-456",
        createdAt: "2026-03-08T12:02:00.000Z",
      },
    ];

    const result = _internal.buildActionHistory(events, rules);

    expect(result).toContain("## Deine bisherigen Aktionen in dieser Session");
    expect(result).toContain(
      '1. Regel erstellt: "Liste weiter eingerückt" (ID: abc-123)',
    );
    expect(result).toContain(
      '2. Regel erstellt: "Überschrift kleiner" (ID: def-456)',
    );
  });

  test("maps rule_disabled events to deletion text", () => {
    const events = [
      {
        eventType: "rule_disabled",
        ruleId: "ghi-789",
        createdAt: "2026-03-08T12:03:00.000Z",
      },
    ];

    const result = _internal.buildActionHistory(events, []);

    expect(result).toContain("1. Regel gelöscht (ID: ghi-789)");
  });

  test("uses fallback text when rule_applied event has no matching rule", () => {
    const events = [
      {
        eventType: "rule_applied",
        ruleId: "unknown-id",
        createdAt: "2026-03-08T12:01:00.000Z",
      },
    ];

    const result = _internal.buildActionHistory(events, []);

    expect(result).toContain(
      '1. Regel erstellt: "(unbekannte Regel)" (ID: unknown-id)',
    );
  });

  test("correct numbering with mixed event types", () => {
    const rules = [
      createFormatRule({
        id: "abc-123",
        instruction: "Liste weiter eingerückt",
      }),
    ];
    const events = [
      {
        eventType: "rule_applied",
        ruleId: "abc-123",
        createdAt: "2026-03-08T12:01:00.000Z",
      },
      {
        eventType: "rule_disabled",
        ruleId: "def-456",
        createdAt: "2026-03-08T12:02:00.000Z",
      },
      {
        eventType: "rule_applied",
        ruleId: "unknown",
        createdAt: "2026-03-08T12:03:00.000Z",
      },
    ];

    const result = _internal.buildActionHistory(events, rules);

    expect(result).toContain(
      '1. Regel erstellt: "Liste weiter eingerückt" (ID: abc-123)',
    );
    expect(result).toContain("2. Regel gelöscht (ID: def-456)");
    expect(result).toContain(
      '3. Regel erstellt: "(unbekannte Regel)" (ID: unknown)',
    );
  });
});

describe("buildSystemPrompt", () => {
  test("reader prompt contains compound examples", () => {
    const prompt = _internal.buildSystemPrompt("reader");

    expect(prompt).toContain("compound");
    expect(prompt).toContain("messageRole");
    expect(prompt).toContain("previousSibling");
  });

  test("reader prompt contains compound guidance", () => {
    const prompt = _internal.buildSystemPrompt("reader");

    expect(prompt).toContain("Wann compound statt block_type");
  });
});
