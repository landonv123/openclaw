/**
 * Shared HTTP client for calling the local vLLM API.
 *
 * This is a raw fetch()-based client that bypasses OpenClaw's agent pipeline
 * entirely — no system prompt overhead, no tool schemas, no session history.
 * Only the caller-supplied messages are sent.
 *
 * Part of the Token Economy principle: minimize paid token usage by offloading
 * low-token work to free local models.
 */

import type { OpenClawConfig } from "../config/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalLlmModelInfo = {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
};

export type LocalLlmConfig = {
  baseUrl: string;
  apiKey?: string;
  models: LocalLlmModelInfo[];
};

export type LocalLlmCallParams = {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

export type LocalLlmCallResult = {
  ok: true;
  text: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
} | {
  ok: false;
  error: string;
};

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/**
 * Reads the vLLM provider config from `models.providers.vllm`.
 * Returns null if no vLLM provider is configured or if it has no models.
 */
export function resolveLocalLlmConfig(cfg?: OpenClawConfig): LocalLlmConfig | null {
  const vllmProvider = cfg?.models?.providers?.vllm;
  if (!vllmProvider?.baseUrl) {
    return null;
  }

  const models: LocalLlmModelInfo[] = (vllmProvider.models ?? [])
    .filter((m) => m?.id && m.contextWindow > 0)
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens || 4096,
    }));

  if (models.length === 0) {
    return null;
  }

  return {
    baseUrl: vllmProvider.baseUrl.replace(/\/+$/, ""),
    apiKey: vllmProvider.apiKey,
    models,
  };
}

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

/**
 * Selects the best model for the given request.
 *
 * If a model hint is provided, it tries fuzzy matching (substring match on id
 * or name). Otherwise, returns the first configured model.
 */
export function selectModel(
  config: LocalLlmConfig,
  hint?: string,
): LocalLlmModelInfo | null {
  if (!hint) {
    return config.models[0] ?? null;
  }

  const lower = hint.toLowerCase();

  // Exact id match
  const exact = config.models.find((m) => m.id.toLowerCase() === lower);
  if (exact) {
    return exact;
  }

  // Fuzzy: substring match on id or name
  const fuzzy = config.models.find(
    (m) =>
      m.id.toLowerCase().includes(lower) ||
      m.name.toLowerCase().includes(lower),
  );
  if (fuzzy) {
    return fuzzy;
  }

  // Keyword aliases
  const aliasMap: Record<string, string[]> = {
    coder: ["coder", "code", "coding"],
    fast: ["3b", "fast", "small", "light"],
    long: ["long", "llama-3.1", "64k", "65k"],
  };
  for (const [, keywords] of Object.entries(aliasMap)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const match = config.models.find((m) => {
        const combined = `${m.id} ${m.name}`.toLowerCase();
        return keywords.some((kw) => combined.includes(kw));
      });
      if (match) {
        return match;
      }
    }
  }

  // Fallback to first model
  return config.models[0] ?? null;
}

// ---------------------------------------------------------------------------
// Simple token estimation (char-based, conservative)
// ---------------------------------------------------------------------------

/** Rough estimate: ~4 chars per token for English text. */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Makes a raw HTTP call to the local vLLM API.
 *
 * This bypasses ALL OpenClaw agent infrastructure — no system prompt,
 * no tool schemas, no session history, no SOUL.md. Only the supplied
 * messages are sent.
 */
export async function callLocalLlm(
  config: LocalLlmConfig,
  params: LocalLlmCallParams,
): Promise<LocalLlmCallResult> {
  const model = selectModel(config, params.model);
  if (!model) {
    return { ok: false, error: "No matching local model found" };
  }

  const maxTokens = Math.min(params.maxTokens ?? 4096, model.maxTokens);

  // Build messages array — only what the caller provides
  const messages: Array<{ role: string; content: string }> = [];
  if (params.system?.trim()) {
    messages.push({ role: "system", content: params.system.trim() });
  }
  messages.push({ role: "user", content: params.prompt });

  // Token budget check
  const promptTokens = estimateTokenCount(
    messages.map((m) => m.content).join("\n"),
  );
  const budgetTokens = model.contextWindow - maxTokens;
  if (promptTokens > budgetTokens) {
    return {
      ok: false,
      error:
        `Prompt too large for ${model.name}: ~${promptTokens} tokens estimated, ` +
        `budget is ${budgetTokens} tokens (${model.contextWindow} context - ${maxTokens} max_tokens). ` +
        `Decompose into smaller chunks and call again.`,
    };
  }

  const url = `${config.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const body = JSON.stringify({
    model: model.id,
    messages,
    max_tokens: maxTokens,
    temperature: params.temperature ?? 0.7,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        error: `vLLM API error ${response.status}: ${errorText || response.statusText}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;

    return { ok: true, text, model: model.id, usage };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: `vLLM API request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s` };
    }
    const message = err instanceof Error ? err.message : String(err);
    // Common case: vLLM is not running
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return {
        ok: false,
        error: `Local vLLM API unreachable at ${config.baseUrl}. Is it running?`,
      };
    }
    return { ok: false, error: `Local LLM call failed: ${message}` };
  }
}
