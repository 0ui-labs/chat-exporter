import Anthropic from "@anthropic-ai/sdk";

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: ClaudeContentBlock[];
};

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/png"; data: string };
    }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type ClaudeTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type ClaudeRequest = {
  model: string;
  system: string;
  messages: ClaudeMessage[];
  tools?: ClaudeTool[];
  max_tokens: number;
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
};

export type ClaudeResponse = {
  id: string;
  content: ClaudeContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

export async function requestClaudeResponse(
  request: ClaudeRequest,
  config: { apiKey: string; timeoutMs: number },
): Promise<ClaudeResponse> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const response = await client.messages.create(
    {
      model: request.model,
      system: request.system,
      messages: request.messages as Anthropic.MessageParam[],
      tools: request.tools as Anthropic.Tool[],
      max_tokens: request.max_tokens,
      tool_choice: request.tool_choice as Anthropic.ToolChoice,
    },
    { timeout: config.timeoutMs },
  );

  return {
    id: response.id,
    content: response.content as ClaudeContentBlock[],
    stop_reason: response.stop_reason as ClaudeResponse["stop_reason"],
    model: response.model,
    usage: response.usage,
  };
}
