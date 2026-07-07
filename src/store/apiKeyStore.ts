import { create } from "zustand";

export type AiProvider = "anthropic" | "openai" | "gemini" | "azure-openai";

export interface ProviderInfo {
  id: AiProvider;
  label: string;
  keyPrefix: string;
  placeholder: string;
  model: string;
  consoleUrl: string;
  consoleName: string;
  color: string;
  /** Azure OpenAI requires endpoint + deployment on top of the key */
  requiresEndpoint?: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    keyPrefix: "sk-ant-",
    placeholder: "sk-ant-api03-...",
    model: "claude-sonnet-4-6",
    consoleUrl: "https://console.anthropic.com",
    consoleName: "console.anthropic.com",
    color: "#cc785c",
  },
  {
    id: "openai",
    label: "GPT-4o (OpenAI)",
    keyPrefix: "sk-",
    placeholder: "sk-proj-...",
    model: "gpt-4o",
    consoleUrl: "https://platform.openai.com/api-keys",
    consoleName: "platform.openai.com",
    color: "#10a37f",
  },
  {
    id: "gemini",
    label: "Gemini 1.5 Pro (Google)",
    keyPrefix: "AIza",
    placeholder: "AIzaSy...",
    model: "gemini-1.5-pro",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    consoleName: "aistudio.google.com",
    color: "#4285f4",
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI (Copilot)",
    keyPrefix: "",
    placeholder: "32-character hex key...",
    model: "gpt-4o (your deployment)",
    consoleUrl: "https://portal.azure.com",
    consoleName: "portal.azure.com",
    color: "#0078d4",
    requiresEndpoint: true,
  },
];

// ── Azure OpenAI config (endpoint + deployment stored separately) ──────────────
export interface AzureConfig {
  endpoint: string;   // e.g. https://myresource.openai.azure.com
  deployment: string; // e.g. gpt-4o
}

const AZURE_CONFIG_KEY = "intune_gm_azure_config";

export function getAzureConfig(): AzureConfig | null {
  const raw = localStorage.getItem(AZURE_CONFIG_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AzureConfig; } catch { return null; }
}

export function saveAzureConfig(cfg: AzureConfig) {
  localStorage.setItem(AZURE_CONFIG_KEY, JSON.stringify(cfg));
}

export function clearAzureConfig() {
  localStorage.removeItem(AZURE_CONFIG_KEY);
}

// ── Key storage ───────────────────────────────────────────────────────────────

const STORAGE_PROVIDER = "intune_gm_ai_provider";
const storageKey = (p: AiProvider) => `intune_gm_key_${p}`;

// Migrate legacy key
const legacyKey = localStorage.getItem("intune_gm_anthropic_key");
if (legacyKey && !localStorage.getItem(storageKey("anthropic"))) {
  localStorage.setItem(storageKey("anthropic"), legacyKey);
  localStorage.removeItem("intune_gm_anthropic_key");
}

function loadKeys(): Record<AiProvider, string | null> {
  return {
    anthropic: localStorage.getItem(storageKey("anthropic")),
    openai: localStorage.getItem(storageKey("openai")),
    gemini: localStorage.getItem(storageKey("gemini")),
    "azure-openai": localStorage.getItem(storageKey("azure-openai")),
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ApiKeyState {
  provider: AiProvider;
  keys: Record<AiProvider, string | null>;
  dialogOpen: boolean;
  apiKey: string | null;
  setProvider: (p: AiProvider) => void;
  setKey: (provider: AiProvider, key: string) => void;
  clearKey: (provider: AiProvider) => void;
  openDialog: () => void;
  closeDialog: () => void;
}

const savedProvider = (localStorage.getItem(STORAGE_PROVIDER) as AiProvider | null) ?? "anthropic";
const initialKeys = loadKeys();

export const useApiKeyStore = create<ApiKeyState>((set) => ({
  provider: savedProvider,
  keys: initialKeys,
  dialogOpen: false,
  apiKey: initialKeys[savedProvider],

  setProvider: (p) => {
    localStorage.setItem(STORAGE_PROVIDER, p);
    set((s) => ({ provider: p, apiKey: s.keys[p] }));
  },

  setKey: (provider, key) => {
    localStorage.setItem(storageKey(provider), key.trim());
    set((s) => {
      const keys = { ...s.keys, [provider]: key.trim() };
      return { keys, apiKey: keys[s.provider], dialogOpen: false };
    });
  },

  clearKey: (provider) => {
    localStorage.removeItem(storageKey(provider));
    if (provider === "azure-openai") clearAzureConfig();
    set((s) => {
      const keys = { ...s.keys, [provider]: null };
      return { keys, apiKey: keys[s.provider] };
    });
  },

  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}));
