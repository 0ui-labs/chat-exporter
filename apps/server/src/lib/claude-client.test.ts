import { afterEach, describe, expect, test, vi } from "vitest";
import type { ClaudeRequest } from "./claude-client.js";
import { requestClaudeResponse } from "./claude-client.js";

const mockCreate = vi.fn();
const constructorCalls: Array<Record<string, unknown>> = [];

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor(opts: Record<string, unknown>) {
        constructorCalls.push(opts);
      }
    },
  };
});

describe("requestClaudeResponse", () => {
  afterEach(() => {
    vi.clearAllMocks();
    constructorCalls.length = 0;
  });

  const baseRequest: ClaudeRequest = {
    model: "claude-sonnet-4-6-20250514",
    system: "You are a helpful assistant.",
    messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    max_tokens: 1024,
  };

  const mockApiResponse = {
    id: "msg_test123",
    content: [{ type: "text", text: "Hello back!" }],
    stop_reason: "end_turn",
    model: "claude-sonnet-4-6-20250514",
    usage: { input_tokens: 10, output_tokens: 5 },
  };

  test("creates Anthropic client with correct API key", async () => {
    mockCreate.mockResolvedValue(mockApiResponse);

    await requestClaudeResponse(baseRequest, {
      apiKey: "sk-ant-test-key",
      timeoutMs: 30000,
    });

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toEqual({ apiKey: "sk-ant-test-key" });
  });

  test("sends correctly formatted request to messages.create", async () => {
    mockCreate.mockResolvedValue(mockApiResponse);

    await requestClaudeResponse(baseRequest, {
      apiKey: "sk-ant-test-key",
      timeoutMs: 30000,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6-20250514",
        system: "You are a helpful assistant.",
        messages: baseRequest.messages,
        max_tokens: 1024,
      }),
      expect.objectContaining({ timeout: 30000 }),
    );
  });

  test("passes tools and tool_choice when provided", async () => {
    mockCreate.mockResolvedValue(mockApiResponse);

    const requestWithTools: ClaudeRequest = {
      ...baseRequest,
      tools: [
        {
          name: "test_tool",
          description: "A test tool",
          input_schema: { type: "object", properties: {} },
        },
      ],
      tool_choice: { type: "auto" },
    };

    await requestClaudeResponse(requestWithTools, {
      apiKey: "sk-ant-test-key",
      timeoutMs: 30000,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: requestWithTools.tools,
        tool_choice: { type: "auto" },
      }),
      expect.anything(),
    );
  });

  test("returns correctly shaped response", async () => {
    mockCreate.mockResolvedValue(mockApiResponse);

    const result = await requestClaudeResponse(baseRequest, {
      apiKey: "sk-ant-test-key",
      timeoutMs: 30000,
    });

    expect(result).toEqual({
      id: "msg_test123",
      content: [{ type: "text", text: "Hello back!" }],
      stop_reason: "end_turn",
      model: "claude-sonnet-4-6-20250514",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  });

  test("passes timeout from config", async () => {
    mockCreate.mockResolvedValue(mockApiResponse);

    await requestClaudeResponse(baseRequest, {
      apiKey: "sk-ant-key",
      timeoutMs: 60000,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 60000 }),
    );
  });
});
