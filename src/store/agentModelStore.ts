import { create } from "zustand";

/**
 * Which model the AI agents (Advisor, Reporter) use.
 * - "byok":   the provider + key from the toolbar key dialog, via /api/claude
 * - "ollama": a local Ollama server — findings never leave the machine
 * - "static": no AI; built-in remediation text and a rule-based summary
 * Only non-secret preferences are stored here; keys stay in apiKeyStore.
 */
export type AgentEngine = "byok" | "ollama" | "static";

/** Only loopback is allowed — the CSP permits exactly these origins. */
export const OLLAMA_URLS = ["http://localhost:11434", "http://127.0.0.1:11434"] as const;
export type OllamaUrl = (typeof OLLAMA_URLS)[number];

interface AgentModelState {
  engine: AgentEngine;
  ollamaUrl: OllamaUrl;
  ollamaModel: string;
  /** Replace policy / user names with placeholders before findings go to a hosted model. */
  maskNames: boolean;
  set: (patch: Partial<Pick<AgentModelState, "engine" | "ollamaUrl" | "ollamaModel" | "maskNames">>) => void;
}

const STORAGE_KEY = "intuneshade.agentModel";

function load(): Partial<AgentModelState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AgentModelState>) : {};
    if (parsed.ollamaUrl && !OLLAMA_URLS.includes(parsed.ollamaUrl)) delete parsed.ollamaUrl;
    return parsed;
  } catch {
    return {};
  }
}

const saved = load();

export const useAgentModelStore = create<AgentModelState>((set, get) => ({
  engine: saved.engine ?? "static",
  ollamaUrl: saved.ollamaUrl ?? OLLAMA_URLS[0],
  ollamaModel: saved.ollamaModel ?? "qwen2.5:7b",
  maskNames: saved.maskNames ?? true,
  set: (patch) => {
    set(patch);
    const { engine, ollamaUrl, ollamaModel, maskNames } = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ engine, ollamaUrl, ollamaModel, maskNames }));
    } catch { /* ignore */ }
  },
}));
