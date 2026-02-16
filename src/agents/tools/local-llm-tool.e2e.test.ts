import { describe, expect, it, vi, beforeEach } from "vitest";
import { createLocalLlmTool } from "./local-llm-tool.js";
import * as client from "../local-llm-client.js";
import type { OpenClawConfig } from "../../config/config.js";

// Mock the client
vi.mock("../local-llm-client.js");

describe("local-llm-tool", () => {
  const mockConfig: OpenClawConfig = {
    models: {
      providers: {
        vllm: {
          baseUrl: "http://localhost:8000",
          models: [{ id: "test-model", contextWindow: 4096, maxTokens: 1024, name: "Test Model", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }]
        }
      }
    }
  };

  beforeEach(() => {
    vi.resetAllMocks();
    // Default successful config resolution
    vi.mocked(client.resolveLocalLlmConfig).mockReturnValue({
      baseUrl: "http://localhost:8000",
      models: [{ id: "test-model", name: "Test Model", contextWindow: 4096, maxTokens: 1024 }]
    });
  });

  it("returns null if config resolution fails", () => {
    vi.mocked(client.resolveLocalLlmConfig).mockReturnValue(null);
    const tool = createLocalLlmTool({ config: mockConfig });
    expect(tool).toBeNull();
  });

  it("returns tool if config is valid", () => {
    const tool = createLocalLlmTool({ config: mockConfig });
    expect(tool).not.toBeNull();
    expect(tool?.name).toBe("local_llm");
    expect(tool?.description).toContain("Free, local LLM endpoint");
    expect(tool?.description).toContain("Test Model (test-model)");
  });

  it("executes successfully", async () => {
    vi.mocked(client.callLocalLlm).mockResolvedValue({
      ok: true,
      text: "Response from local LLM",
      model: "test-model",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    });

    const tool = createLocalLlmTool({ config: mockConfig })!;
    const result = await tool.execute("call-id", {
      prompt: "Hello",
      model: "test-model",
      max_tokens: 100
    });

    const content = JSON.parse((result.content[0] as any).text);
    expect(content.response).toBe("Response from local LLM");
    expect(content.model).toBe("test-model");
    expect(content.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });

    expect(client.callLocalLlm).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: "Hello",
        model: "test-model",
        maxTokens: 100
      })
    );
  });

  it("handles client errors", async () => {
    vi.mocked(client.callLocalLlm).mockResolvedValue({
      ok: false,
      error: "Connection refused"
    });

    const tool = createLocalLlmTool({ config: mockConfig })!;
    const result = await tool.execute("call-id", {
      prompt: "Hello"
    });

    const content = JSON.parse((result.content[0] as any).text);
    expect(content.error).toBe("Connection refused");
    expect(content.hint).toContain("Try decomposing into smaller chunks");
  });
});
