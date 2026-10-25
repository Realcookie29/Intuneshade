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
    label: "Gemini 2.5 Pro (Google)",
    keyPrefix: "AIza",
    placeholder: "AIzaSy...",
    model: "gemini-2.5-pro",
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
// Keys live in sessionStorage (gone when the tab closes, cleared on sign-out)
// unless the user opts in to "remember on this device" (localStorage).

const STORAGE_PROVIDER = "intune_gm_ai_provider";
const REMEMBER_KEY = "intune_gm_remember_keys";
const storageKey = (p: AiProvider) => `intune_gm_key_${p}`;
const ALL_PROVIDERS: AiProvider[] = ["anthropic", "openai", "gemini", "azure-openai"];

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

// Migrate legacy key
safe(() => {
  const legacyKey = localStorage.getItem("intune_gm_anthropic_key");
  if (legacyKey && !localStorage.getItem(storageKey("anthropic"))) {
    localStorage.setItem(storageKey("anthropic"), legacyKey);
  }
  localStorage.removeItem("intune_gm_anthropic_key");
}, undefined);

// Users who stored keys before this setting existed keep them remembered.
safe(() => {
  if (localStorage.getItem(REMEMBER_KEY) === null && ALL_PROVIDERS.some((p) => localStorage.getItem(storageKey(p)))) {
    localStorage.setItem(REMEMBER_KEY, "1");
  }
}, undefined);

const rememberKeys = (): boolean => safe(() => localStorage.getItem(REMEMBER_KEY) === "1", false);
const keyStorage = (remember: boolean): Storage => (remember ? localStorage : sessionStorage);

function loadKeys(remember: boolean): Record<AiProvider, string | null> {
  const store = keyStorage(remember);
  return Object.fromEntries(ALL_PROVIDERS.map((p) => [p, safe(() => store.getItem(storageKey(p)), null)])) as Record<AiProvider, string | null>;
}

/** Removes every stored key from both storages. */
function wipeKeys() {
  for (const store of [localStorage, sessionStorage]) {
    for (const p of ALL_PROVIDERS) safe(() => store.removeItem(storageKey(p)), undefined);
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ApiKeyState {
  provider: AiProvider;
  keys: Record<AiProvider, string | null>;
  dialogOpen: boolean;
  apiKey: string | null;
  /** Keep keys across browser sessions (localStorage) instead of this tab only. */
  remember: boolean;
  setRemember: (remember: boolean) => void;
  /** Called on sign-out: drops keys unless the user chose to remember them. */
  clearOnSignOut: () => void;
  setProvider: (p: AiProvider) => void;
  setKey: (provider: AiProvider, key: string) => void;
  clearKey: (provider: AiProvider) => void;
  openDialog: () => void;
  closeDialog: () => void;
}

const savedProvider = safe(() => localStorage.getItem(STORAGE_PROVIDER) as AiProvider | null, null) ?? "anthropic";
const initialRemember = rememberKeys();
const initialKeys = loadKeys(initialRemember);

export const useApiKeyStore = create<ApiKeyState>((set) => ({
  provider: savedProvider,
  keys: initialKeys,
  dialogOpen: false,
  apiKey: initialKeys[savedProvider],
  remember: initialRemember,

  setRemember: (remember) => {
    const { keys } = useApiKeyStore.getState();
    wipeKeys();
    safe(() => localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0"), undefined);
    const store = keyStorage(remember);
    for (const p of ALL_PROVIDERS) {
      const k = keys[p];
      if (k) safe(() => store.setItem(storageKey(p), k), undefined);
    }
    set({ remember });
  },

  clearOnSignOut: () => {
    if (useApiKeyStore.getState().remember) return;
    wipeKeys();
    set({ keys: { anthropic: null, openai: null, gemini: null, "azure-openai": null }, apiKey: null });
  },

  setProvider: (p) => {
    safe(() => localStorage.setItem(STORAGE_PROVIDER, p), undefined);
    set((s) => ({ provider: p, apiKey: s.keys[p] }));
  },

  setKey: (provider, key) => {
    set((s) => {
      safe(() => keyStorage(s.remember).setItem(storageKey(provider), key.trim()), undefined);
      const keys = { ...s.keys, [provider]: key.trim() };
      return { keys, apiKey: keys[s.provider], dialogOpen: false };
    });
  },

  clearKey: (provider) => {
    for (const store of [localStorage, sessionStorage]) safe(() => store.removeItem(storageKey(provider)), undefined);
    if (provider === "azure-openai") clearAzureConfig();
    set((s) => {
      const keys = { ...s.keys, [provider]: null };
      return { keys, apiKey: keys[s.provider] };
    });
  },

  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}));
