// ─── Agent model provider ─────────────────────────────────────────────────────
// One entry point for the AI agents, whatever model the user picked:
//   byok   → /api/claude proxy with the user's own key (Claude, OpenAI, Gemini, Azure)
//   ollama → local Ollama server, straight from the browser (no proxy, no egress)

import { useApiKeyStore, getAzureConfig, PROVIDERS } from "../../store/apiKeyStore";
import { useAgentModelStore } from "../../store/agentModelStore";
import { ADVISE_SYSTEM, REPORT_SYSTEM } from "./prompts";

export type AgentMode = "advise" | "report";

export interface ModelInfo {
  engine: "byok" | "ollama" | "static";
  label: string;
  /** True when findings leave the user's machine. */
  leavesDevice: boolean;
  /** Who receives the data, for the UI badge. */
  recipient?: string;
}

/** Describes the model the agents will use right now (falls back to static when not configured). */
export function currentModel(): ModelInfo {
  const { engine, ollamaModel } = useAgentModelStore.getState();
  if (engine === "ollama") {
    return { engine, label: `Ollama · ${ollamaModel}`, leavesDevice: false };
  }
  if (engine === "byok") {
    const { provider, apiKey } = useApiKeyStore.getState();
    const info = PROVIDERS.find((p) => p.id === provider);
    if (apiKey && info) {
      return {
        engine,
        label: info.label,
        leavesDevice: true,
        recipient: info.label.replace(/^.*\((.*)\)$/, "$1"),
      };
    }
  }
  return { engine: "static", label: "Built-in rules (no AI)", leavesDevice: false };
}

async function callProxy(mode: AgentMode, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  const { provider, apiKey } = useApiKeyStore.getState();
  if (!apiKey) throw new Error("No API key configured");
  const azure = provider === "azure-openai" ? getAzureConfig() : null;
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({
      mode,
      provider,
      payload,
      ...(azure ? { azureEndpoint: azure.endpoint, azureDeployment: azure.deployment } : {}),
    }),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string") msg = j.error;
    } catch { /* keep generic */ }
    throw new Error(msg);
  }
  return JSON.parse(text);
}

async function callOllama(mode: AgentMode, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  const { ollamaUrl, ollamaModel } = useAgentModelStore.getState();
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      format: "json",
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: mode === "advise" ? ADVISE_SYSTEM : REPORT_SYSTEM },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { message?: { content?: string } };
  const content = (body.message?.content ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  return JSON.parse(content);
}

/** Runs an agent prompt on the configured model. Throws when no model is configured. */
export async function runAgentPrompt(mode: AgentMode, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  const model = currentModel();
  if (model.engine === "ollama") return callOllama(mode, payload, signal);
  if (model.engine === "byok") return callProxy(mode, payload, signal);
  throw new Error("No AI model configured");
}

/** Lists the models installed on a local Ollama server — doubles as a connection test. */
export async function listOllamaModels(url: string): Promise<string[]> {
  const res = await fetch(`${url}/api/tags`);
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const body = (await res.json()) as { models?: Array<{ name: string }> };
  return (body.models ?? []).map((m) => m.name);
}
