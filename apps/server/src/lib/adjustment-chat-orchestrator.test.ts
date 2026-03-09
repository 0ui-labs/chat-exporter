import type {
  AdjustmentSelection,
  AdjustmentSessionDetail,
  Role,
} from "@chat-exporter/shared";
import { expect, test } from "vitest";

import {
  AdjustmentChatUnavailableError,
  runAdjustmentChatTurn,
} from "./adjustment-chat-orchestrator.js";

const configEnvKeys = [
  "ADJUSTMENT_RULE_COMPILATION_ENABLED",
  "ADJUSTMENT_RULE_COMPILATION_PROVIDER",
  "ADJUSTMENT_RULE_COMPILATION_MODEL",
  "OPENAI_API_BASE_URL",
  "OPENAI_API_KEY",
] as const;

function createSelection(
  overrides: Partial<AdjustmentSelection> = {},
): AdjustmentSelection {
  return {
    blockIndex: 0,
    blockType: "paragraph",
    messageId: "assistant-1",
    messageIndex: 1,
    messageRole: "assistant",
    selectedText: "**Wichtig:** Zuständigkeiten müssen sichtbar bleiben.",
    textQuote: "**Wichtig:** Zuständigkeiten müssen sichtbar bleiben.",
    ...overrides,
  };
}

function createSessionDetail(
  userMessage: string,
  overrides: Partial<AdjustmentSelection> = {},
): AdjustmentSessionDetail {
  return {
    messages: [
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
      selection: createSelection(overrides),
      status: "open",
      targetFormat: "reader",
      updatedAt: "2026-03-08T12:01:00.000Z",
    },
  };
}

function restoreEnv(
  snapshot: Partial<Record<(typeof configEnvKeys)[number], string | undefined>>,
) {
  for (const key of configEnvKeys) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

test("chat turn fails clearly when live OpenAI chat is not configured", async () => {
  const envSnapshot = Object.fromEntries(
    configEnvKeys.map((key) => [key, process.env[key]]),
  ) as Partial<Record<(typeof configEnvKeys)[number], string | undefined>>;

  delete process.env.ADJUSTMENT_RULE_COMPILATION_ENABLED;
  delete process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER;
  delete process.env.OPENAI_API_KEY;

  try {
    await expect(
      runAdjustmentChatTurn({
        activeRules: [],
        executeApplyAdjustmentRule: async () => ({
          ok: true,
          summary: "unused",
        }),
        sessionDetail: createSessionDetail(
          "Bitte stelle den markierten Text klarer dar.",
        ),
      }),
    ).rejects.toThrow(/nicht konfiguriert/i);
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("chat turn can apply a rule through a tool call and return a short German confirmation", async () => {
  const envSnapshot = Object.fromEntries(
    configEnvKeys.map((key) => [key, process.env[key]]),
  ) as Partial<Record<(typeof configEnvKeys)[number], string | undefined>>;
  const originalFetch = globalThis.fetch;
  const seenBodies: unknown[] = [];

  process.env.ADJUSTMENT_RULE_COMPILATION_ENABLED = "1";
  process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "openai";
  process.env.ADJUSTMENT_RULE_COMPILATION_MODEL = "gpt-5-mini";
  process.env.OPENAI_API_BASE_URL = "https://example.test/v1";
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = async (url, init) => {
    expect(url).toBe("https://example.test/v1/responses");
    const body = JSON.parse(String(init?.body));

    seenBodies.push(body);

    if (seenBodies.length === 1) {
      expect(body.tools?.[0]?.name).toBe("apply_adjustment_rule");
      expect(body.store).toBe(true);
      expect(body.input?.[1]?.content?.[0]?.text).toMatch(
        /bold formatierung sichtbar/i,
      );

      return new Response(
        JSON.stringify({
          id: "resp_1",
          output: [
            {
              arguments: JSON.stringify({
                instruction:
                  "Rendere vorhandene Markdown-Fettdruck-Markierungen in der Auswahl direkt sichtbar.",
              }),
              call_id: "call_1",
              name: "apply_adjustment_rule",
              status: "completed",
              type: "function_call",
            },
          ],
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    }

    expect(body.previous_response_id).toBe("resp_1");
    expect(body.store).toBe(true);
    expect(body.input?.[0]?.type).toBe("function_call_output");
    expect(body.input?.[0]?.output).toMatch(/Markdown-Fettdruck-Markierungen/i);

    return new Response(
      JSON.stringify({
        id: "resp_2",
        output_text:
          "Ich habe den markierten Fettdruck jetzt direkt im Reader sichtbar gemacht.",
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      },
    );
  };

  try {
    const result = await runAdjustmentChatTurn({
      activeRules: [],
      executeApplyAdjustmentRule: async ({ instruction }) => {
        expect(instruction).toMatch(/fettdruck-markierungen/i);

        return {
          ok: true,
          ruleId: "rule-1",
          summary:
            "Rendere vorhandene Markdown-Fettdruck-Markierungen in der Auswahl direkt sichtbar.",
        };
      },
      sessionDetail: createSessionDetail(
        "Bitte mach die bold formatierung sichtbar.",
      ),
    });

    expect(result.didApplyRule).toBe(true);
    expect(result.didRequestClarification).toBe(false);
    expect(result.assistantMessage).toBe(
      "Ich habe den markierten Fettdruck jetzt direkt im Reader sichtbar gemacht.",
    );
    expect(result.toolMessages[0] ?? "").toMatch(/Regel direkt angewendet/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  }
});

test("chat turn can ask one short clarification when the request is still vague", async () => {
  const envSnapshot = Object.fromEntries(
    configEnvKeys.map((key) => [key, process.env[key]]),
  ) as Partial<Record<(typeof configEnvKeys)[number], string | undefined>>;
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  process.env.ADJUSTMENT_RULE_COMPILATION_ENABLED = "1";
  process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "openai";
  process.env.ADJUSTMENT_RULE_COMPILATION_MODEL = "gpt-5-mini";
  process.env.OPENAI_API_BASE_URL = "https://example.test/v1";
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = async () => {
    callCount += 1;

    return new Response(
      JSON.stringify({
        id: "resp_3",
        output_text:
          "Soll das nur an dieser Stelle gelten oder auch für ähnliche Stellen?",
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      },
    );
  };

  try {
    const result = await runAdjustmentChatTurn({
      activeRules: [],
      executeApplyAdjustmentRule: async () => {
        throw new Error("tool should not be called");
      },
      sessionDetail: createSessionDetail("Mach das bitte besser."),
    });

    expect(callCount).toBe(1);
    expect(result.didApplyRule).toBe(false);
    expect(result.didRequestClarification).toBe(true);
    expect(result.toolMessages.length).toBe(0);
    expect(result.assistantMessage).toMatch(/ähnliche Stellen/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  }
});
