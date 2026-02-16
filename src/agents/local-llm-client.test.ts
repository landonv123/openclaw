import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveLocalLlmConfig, selectModel, callLocalLlm, type LocalLlmConfig } from "./local-llm-client.js";
import type { OpenClawConfig } from "../config/config.js";

describe("local-llm-client", () => {
  describe("resolveLocalLlmConfig", () => {
    it("returns null if no vLLM provider configured", () => {
      const config: OpenClawConfig = { models: { providers: {} } };
      expect(resolveLocalLlmConfig(config)).toBeNull();
    });

    it("returns null if configured but no base URL", () => {
      const config: OpenClawConfig = {
        models: {
          providers: {
            vllm: { baseUrl: "", models: [] }
          }
        }
      };
      expect(resolveLocalLlmConfig(config)).toBeNull();
    });

    it("resolves valid config with models", () => {
      const config: OpenClawConfig = {
        models: {
          providers: {
            vllm: {
              baseUrl: "http://localhost:8000/v1/",
              apiKey: "test-key",
              models: [
                { id: "model-a", contextWindow: 4096, maxTokens: 1024, name: "Model A", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
                { id: "model-b", contextWindow: 8192, maxTokens: 2048, name: "Model B", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
              ]
            }
          }
        }
      };

      const result = resolveLocalLlmConfig(config);
      expect(result).not.toBeNull();
      expect(result?.baseUrl).toBe("http://localhost:8000/v1"); // Strips trailing slash
      expect(result?.apiKey).toBe("test-key");
      expect(result?.models).toHaveLength(2);
      expect(result?.models[0].id).toBe("model-a");
    });
  });

  describe("selectModel", () => {
    const config: LocalLlmConfig = {
      baseUrl: "http://localhost:8000",
      models: [
        { id: "Qwen/Qwen2.5-Coder-14B", name: "Qwen Coder", contextWindow: 32000, maxTokens: 4096 },
        { id: "meta-llama/Llama-3.2-3B", name: "Llama 3B Fast", contextWindow: 128000, maxTokens: 4096 },
        { id: "Llama-3.1-8B-Instruct", name: "Llama 8B", contextWindow: 8000, maxTokens: 4096 },
      ]
    };

    it("returns first model if no hint provided", () => {
      expect(selectModel(config, undefined)?.id).toBe("Qwen/Qwen2.5-Coder-14B");
    });

    it("matches exact ID", () => {
      expect(selectModel(config, "meta-llama/Llama-3.2-3B")?.id).toBe("meta-llama/Llama-3.2-3B");
    });

    it("matches fuzzy name (substring)", () => {
      expect(selectModel(config, "Coder")?.id).toBe("Qwen/Qwen2.5-Coder-14B");
      expect(selectModel(config, "Fast")?.id).toBe("meta-llama/Llama-3.2-3B");
    });

    it("matches fuzzy ID (substring)", () => {
      expect(selectModel(config, "Qwen2.5")?.id).toBe("Qwen/Qwen2.5-Coder-14B");
    });

    it("matches aliases", () => {
      expect(selectModel(config, "code")?.id).toBe("Qwen/Qwen2.5-Coder-14B");
      expect(selectModel(config, "light")?.id).toBe("meta-llama/Llama-3.2-3B");
      expect(selectModel(config, "llama-3.1")?.id).toBe("Llama-3.1-8B-Instruct");
    });

    it("falls back to first model if no match found", () => {
      expect(selectModel(config, "non-existent")?.id).toBe("Qwen/Qwen2.5-Coder-14B");
    });
  });

  describe("callLocalLlm", () => {
    const config: LocalLlmConfig = {
      baseUrl: "http://localhost:8000",
      models: [{ id: "test-model", name: "Test", contextWindow: 100, maxTokens: 50 }]
    };

    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("checks token budget locally", async () => {
      // Very long prompt that definitely exceeds 100 char context budget
      const longPrompt = "a".repeat(1000);
      const result = await callLocalLlm(config, { prompt: longPrompt });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Prompt too large");
      }
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("calls fetch with correct parameters", async () => {
      const mockSuccess = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Success response" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
      (global.fetch as any).mockResolvedValue(mockSuccess);

      const result = await callLocalLlm(config, {
        prompt: "Hello",
        system: "You are a helper",
        temperature: 0.5
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:8000/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: expect.stringContaining('"model":"test-model"')
        })
      );

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({ role: "system", content: "You are a helper" });
      expect(body.messages[1]).toEqual({ role: "user", content: "Hello" });
      expect(body.temperature).toBe(0.5);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.text).toBe("Success response");
        expect(result.usage?.totalTokens).toBe(15);
      }
    });

    it("handles fetch errors gracefully", async () => {
      (global.fetch as any).mockRejectedValue(new Error("fetch failed"));
      const result = await callLocalLlm(config, { prompt: "Hello" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("unreachable");
      }
    });
  });
});
