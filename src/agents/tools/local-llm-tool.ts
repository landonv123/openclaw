/**
 * Agent tool: local_llm
 *
 * Exposes the local vLLM API as a tool that Claude can call to delegate
 * processing to **free** local models. The tool sends ONLY the caller-supplied
 * prompt — no OpenClaw system prompt, no tool schemas, no session history,
 * no SOUL.md. It's a completely separate code path from the agent pipeline.
 *
 * Part of the Token Economy principle: save paid API tokens by offloading
 * low-token work to the free local API. Claude should actively decompose
 * large tasks into focused sub-prompts that fit the local model's context.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import {
  callLocalLlm,
  resolveLocalLlmConfig,
  type LocalLlmConfig,
} from "../local-llm-client.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const LocalLlmSchema = Type.Object({
  prompt: Type.String(),
  model: Type.Optional(Type.String()),
  system: Type.Optional(Type.String()),
  max_tokens: Type.Optional(Type.Number()),
  temperature: Type.Optional(Type.Number()),
});

// ---------------------------------------------------------------------------
// Tool description builder
// ---------------------------------------------------------------------------

function buildToolDescription(config: LocalLlmConfig): string {
  const modelLines = config.models
    .map(
      (m) =>
        `  • ${m.name} (${m.id}) — ${Math.round(m.contextWindow / 1024)}k context, ${m.maxTokens} max output`,
    )
    .join("\n");

  return [
    "Free, local LLM endpoint (vLLM). Calls are free — zero API token cost.",
    "",
    "Use this to offload ANY processing that does not require your full tool suite.",
    "Only your prompt is sent — no system prompt overhead, no tool schemas, no session history.",
    "",
    "IMPORTANT: Actively design prompts to fit the local model's context window.",
    "Decompose large tasks into focused sub-prompts, extract only relevant portions,",
    "and call this tool multiple times for multi-step work. The goal is to minimize",
    "paid API token usage by routing as much processing as possible through this free endpoint.",
    "",
    "Good uses: code generation, summarization, text formatting, translation,",
    "data extraction, analysis, cross-checking, batch item processing.",
    "",
    "Available models:",
    modelLines,
    "",
    "Parameters:",
    "  • prompt (required): your task — can be anything you construct",
    "  • model (optional): model hint — name, id, or keyword like 'coder', 'fast'",
    "  • system (optional): system prompt for the local model (keep minimal)",
    "  • max_tokens (optional): max response tokens, default 4096",
    "  • temperature (optional): sampling temperature, default 0.7",
    "",
    "Note: only one model runs at a time on the GPU. If you request a model",
    "that isn't currently loaded, there may be a swap delay.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the local_llm tool. Returns null if no vLLM provider is configured,
 * so the tool simply won't appear in the agent's tool list.
 */
export function createLocalLlmTool(options: {
  config?: OpenClawConfig;
}): AnyAgentTool | null {
  const config = resolveLocalLlmConfig(options.config);
  if (!config) {
    return null;
  }

  return {
    label: "Local LLM",
    name: "local_llm",
    description: buildToolDescription(config),
    parameters: LocalLlmSchema,
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const prompt = readStringParam(params, "prompt", {
        required: true,
      });
      const model = readStringParam(params, "model");
      const system = readStringParam(params, "system");
      const maxTokens = readNumberParam(params, "max_tokens");
      const temperature = readNumberParam(params, "temperature");

      const result = await callLocalLlm(config, {
        prompt,
        system,
        model,
        maxTokens,
        temperature,
      });

      if (!result.ok) {
        return jsonResult({
          error: result.error,
          hint: "The local LLM is unavailable or the prompt was too large. "
            + "Try decomposing into smaller chunks, or proceed without the local model.",
        });
      }

      return jsonResult({
        response: result.text,
        model: result.model,
        usage: result.usage,
      });
    },
  };
}
