import "../load-env.js";

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";
const DEFAULT_CEREBRAS_API_BASE_URL = "https://api.cerebras.ai/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CEREBRAS_MAX_COMPLETION_TOKENS = 2048;
const DEFAULT_CEREBRAS_REASONING_EFFORT = "low";

export type AdjustmentAiConfig = {
  enabled: boolean;
  provider: "openai" | "cerebras" | "deterministic";
  model: string;
  timeoutMs: number;
  disabledReason?: string;
  openai?: {
    apiBaseUrl: string;
    apiKey: string;
  };
  cerebras?: {
    apiBaseUrl: string;
    apiKey: string;
    maxCompletionTokens: number;
    reasoningEffort: "none" | "low" | "medium" | "high";
  };
};

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsed));
}

function readProviderSelection() {
  const rawValue =
    process.env.ADJUSTMENT_RULE_COMPILATION_PROVIDER?.trim().toLowerCase() ??
    process.env.STRUCTURING_PROVIDER?.trim().toLowerCase();

  if (
    rawValue === "openai" ||
    rawValue === "cerebras" ||
    rawValue === "deterministic"
  ) {
    return rawValue;
  }

  return "auto";
}

function readReasoningEffort(value: string | undefined) {
  switch (value?.trim().toLowerCase()) {
    case "none":
    case "low":
    case "medium":
    case "high":
      return value.trim().toLowerCase() as "none" | "low" | "medium" | "high";
    default:
      return DEFAULT_CEREBRAS_REASONING_EFFORT as "low";
  }
}

export function readAdjustmentAiConfig(): AdjustmentAiConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const cerebrasApiKey = process.env.CEREBRAS_API_KEY?.trim();
  const rawEnabled =
    process.env.ADJUSTMENT_RULE_COMPILATION_ENABLED?.trim().toLowerCase() ??
    process.env.STRUCTURING_ENABLED?.trim().toLowerCase();
  const explicitlyDisabled =
    rawEnabled === "0" || rawEnabled === "false" || rawEnabled === "off";
  const providerSelection = readProviderSelection();
  const openAiModel =
    process.env.ADJUSTMENT_RULE_COMPILATION_MODEL?.trim() ||
    process.env.OPENAI_STRUCTURING_MODEL?.trim() ||
    DEFAULT_MODEL;
  const cerebrasModel =
    process.env.ADJUSTMENT_RULE_COMPILATION_CEREBRAS_MODEL?.trim() ||
    process.env.CEREBRAS_STRUCTURING_MODEL?.trim() ||
    DEFAULT_CEREBRAS_MODEL;
  const openAiApiBaseUrl =
    process.env.OPENAI_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_API_BASE_URL;
  const cerebrasApiBaseUrl =
    process.env.CEREBRAS_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_CEREBRAS_API_BASE_URL;
  const timeoutMs = readPositiveInteger(
    process.env.ADJUSTMENT_RULE_COMPILATION_TIMEOUT_MS ??
      process.env.STRUCTURING_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );

  if (explicitlyDisabled) {
    return {
      disabledReason: "ADJUSTMENT_RULE_COMPILATION_ENABLED is disabled.",
      enabled: false,
      model: openAiModel,
      provider: "deterministic",
      timeoutMs,
    };
  }

  const selectedProvider =
    providerSelection === "auto"
      ? apiKey
        ? "openai"
        : cerebrasApiKey
          ? "cerebras"
          : "deterministic"
      : providerSelection;

  if (selectedProvider === "openai") {
    return {
      disabledReason: apiKey ? undefined : "OPENAI_API_KEY is not configured.",
      enabled: Boolean(apiKey),
      model: openAiModel,
      openai: apiKey
        ? {
            apiBaseUrl: openAiApiBaseUrl,
            apiKey,
          }
        : undefined,
      provider: "openai",
      timeoutMs,
    };
  }

  if (selectedProvider === "cerebras") {
    return {
      cerebras: cerebrasApiKey
        ? {
            apiBaseUrl: cerebrasApiBaseUrl,
            apiKey: cerebrasApiKey,
            maxCompletionTokens: readPositiveInteger(
              process.env.ADJUSTMENT_RULE_COMPILATION_MAX_COMPLETION_TOKENS ??
                process.env.CEREBRAS_STRUCTURING_MAX_COMPLETION_TOKENS,
              DEFAULT_CEREBRAS_MAX_COMPLETION_TOKENS,
            ),
            reasoningEffort: readReasoningEffort(
              process.env.ADJUSTMENT_RULE_COMPILATION_REASONING_EFFORT ??
                process.env.CEREBRAS_STRUCTURING_REASONING_EFFORT,
            ),
          }
        : undefined,
      disabledReason: cerebrasApiKey
        ? undefined
        : "CEREBRAS_API_KEY is not configured.",
      enabled: Boolean(cerebrasApiKey),
      model: cerebrasModel,
      provider: "cerebras",
      timeoutMs,
    };
  }

  return {
    disabledReason:
      "No adjustment rule compilation provider key is configured.",
    enabled: false,
    model: openAiModel,
    provider: "deterministic",
    timeoutMs,
  };
}
