import { afterEach, describe, expect, test } from "vitest";
import { readAdjustmentAiConfig } from "./adjustment-ai-config.js";

describe("readAdjustmentAiConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("anthropic provider", () => {
    test("reads ANTHROPIC_API_KEY from env", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
      process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "anthropic";

      const config = readAdjustmentAiConfig();

      expect(config.provider).toBe("anthropic");
      expect(config.anthropic?.apiKey).toBe("sk-ant-test-key");
    });

    test("returns enabled when provider is anthropic and key exists", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
      process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "anthropic";

      const config = readAdjustmentAiConfig();

      expect(config.enabled).toBe(true);
      expect(config.disabledReason).toBeUndefined();
    });

    test("returns disabled when provider is anthropic and key missing", () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "anthropic";

      const config = readAdjustmentAiConfig();

      expect(config.enabled).toBe(false);
      expect(config.provider).toBe("anthropic");
      expect(config.disabledReason).toMatch(/ANTHROPIC_API_KEY/i);
    });

    test("uses default anthropic model when ADJUSTMENT_AGENT_MODEL not set", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
      process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "anthropic";
      delete process.env.ADJUSTMENT_AGENT_MODEL;

      const config = readAdjustmentAiConfig();

      expect(config.model).toBe("claude-sonnet-4-6-20250514");
    });

    test("uses custom model from ADJUSTMENT_AGENT_MODEL", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
      process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "anthropic";
      process.env.ADJUSTMENT_AGENT_MODEL = "claude-opus-4-20250514";

      const config = readAdjustmentAiConfig();

      expect(config.model).toBe("claude-opus-4-20250514");
    });
  });

  describe("auto provider selection with anthropic", () => {
    test("prefers anthropic when ANTHROPIC_API_KEY is set in auto mode", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
      process.env.OPENAI_API_KEY = "sk-openai-test-key";
      process.env.CEREBRAS_API_KEY = "csk-cerebras-test-key";
      delete process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER;
      delete process.env.STRUCTURING_PROVIDER;

      const config = readAdjustmentAiConfig();

      expect(config.provider).toBe("anthropic");
      expect(config.enabled).toBe(true);
    });

    test("falls back to openai when only OPENAI_API_KEY is set in auto mode", () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.OPENAI_API_KEY = "sk-openai-test-key";
      delete process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER;
      delete process.env.STRUCTURING_PROVIDER;

      const config = readAdjustmentAiConfig();

      expect(config.provider).toBe("openai");
    });
  });

  describe("provider selection validation", () => {
    test("accepts anthropic as valid provider selection", () => {
      process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER = "anthropic";
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const config = readAdjustmentAiConfig();

      expect(config.provider).toBe("anthropic");
    });
  });
});
