# 🦞 OpenClaw Fork — Local LLM Configuration

This is a **personal fork** of [OpenClaw](https://github.com/openclaw/openclaw), customized to run as a safe, optimized personal AI assistant powered by **self-hosted local LLMs** via vLLM.

> [!IMPORTANT]
> This repo is **not run on this machine**. It is only edited here. The Gateway runs on the **Mac Mini**.

## Architecture

```
┌─────────────────────────────┐
│   This PC (Windows, 4090)   │
│                             │
│  • Edit openclaw repo here  │
│  • vLLM API on port 8010    │
│  • local_llm_api orchestrator│
└─────────┬───────────────────┘
          │ git push
          ▼
     ┌─────────┐
     │ GitHub  │
     └────┬────┘
          │ git pull
          ▼
┌─────────────────────────────┐      LAN API call       ┌──────────────────┐
│      Mac Mini (host)        │ ──────────────────────── │  vLLM on :8010   │
│                             │  http://<IP>:8010/v1     │  (this PC)       │
│  • Runs OpenClaw Gateway    │                          └──────────────────┘
│  • Connects to channels     │
│  • Port 18789               │
└─────────────────────────────┘
```

## Local LLM Backend

The vLLM orchestrator lives at `C:\Users\lando\Documents\local_llm_api` on this PC. It serves models via an **OpenAI-compatible API** on port `8010`.

Available models (configured in `models_config_vllm_single.yaml`):

| Alias | Model | Context | Use Case |
|---|---|---|---|
| `coding` | `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` | 32k | Code gen, debugging |
| `daily-driver` | `Qwen/Qwen2.5-14B-Instruct-AWQ` | 32k | General tasks |
| `long-context` | `Meta-Llama-3.1-8B-Instruct-AWQ-INT4` | 64k | Long docs |
| `llama-3-2-3b` | `meta-llama/Llama-3.2-3B-Instruct` | 128k | Fast/lightweight |
| `glm-4-9b` | `zai-org/glm-4-9b-chat-1m-hf` | 45k | GLM-4 chat |

Only **one model is loaded at a time** (single RTX 4090, 24GB VRAM). The orchestrator handles swapping.

## Fork Goals

1. **Safe** — Hardened security defaults for channels and tools
2. **Optimized** — Tuned for local model constraints (context windows, VRAM)
3. **Local-first** — No cloud API dependency for inference; all models served from this PC

## Dev Workflow

1. **Edit** code/config on this Windows PC
2. **Push** to GitHub
3. **Pull** on Mac Mini → `pnpm install && pnpm build`
4. **Run** `pnpm openclaw gateway` on Mac Mini

## Config Integration

On the Mac Mini, `~/.openclaw/openclaw.json` points the vLLM provider at this PC's LAN IP. See `openclaw.config.example.json` in this repo for the template.

## Token Economy

**Core Principle:** Minimize paid token usage (Claude) in every possible way without significantly altering usability, performance, or capability.

### Strategy

1.  **Phase 1: `local_llm` Agent Tool**
    *   Claude has access to a tool that lets it delegate **any** low-token task to the free local API.
    *   **Bypasses Overhead:** The tool sends *only* the prompt Claude constructs — no system prompt, no session history, no tool schemas. It's a raw request to vLLM.
    *   **Active Decomposition:** Claude is instructed to actively decompose large tasks, extract relevant portions, and break work into chunks that fit the local model's context window.

2.  **Phase 2: Internal Offloading (Future)**
    *   Compaction (summarizing old history) will be routed to local models.
    *   Memory flush operations will use local models.
    *   Tool result summarization will use local models.

3.  **Phase 3: System Optimization (Future)**
    *   System prompt auditing and trimming.
    *   Response caching for deterministic outputs.
