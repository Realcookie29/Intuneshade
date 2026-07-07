import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RiskItem {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
}

export interface RecommendationItem {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface AnalysisResult {
  summary: string;
  risks: RiskItem[];
  recommendations: RecommendationItem[];
  analyzedAt: number; // timestamp
  policyIds: string[]; // the policies that were analyzed together
}

export interface ScriptResult {
  script: string;
  explanation: string;
  language: "powershell" | "graph";
}

type AnalysisStatus = "idle" | "loading" | "success" | "error";

interface AnalysisState {
  // Cache: key is sorted policyIds joined with ","
  cache: Record<string, AnalysisResult>;
  // Current panel state
  panelOpen: boolean;
  currentKey: string | null;
  status: AnalysisStatus;
  error: string | null;
  // Script generator
  scriptPanelOpen: boolean;
  scriptResult: ScriptResult | null;
  scriptStatus: AnalysisStatus;
  scriptError: string | null;

  // Actions
  analyze: (policies: Array<{ id: string; name: string; type: string; json: unknown }>) => Promise<void>;
  generateScript: (description: string, scriptType: "powershell" | "graph") => Promise<void>;
  openPanel: (key: string) => void;
  closePanel: () => void;
  openScriptPanel: () => void;
  closeScriptPanel: () => void;
  getCached: (policyIds: string[]) => AnalysisResult | null;
}

// ─── API helper ───────────────────────────────────────────────────────────────

function getAiConfig() {
  const provider = localStorage.getItem("intune_gm_ai_provider") ?? "anthropic";
  const key = localStorage.getItem(`intune_gm_key_${provider}`);
  const azureRaw = localStorage.getItem("intune_gm_azure_config");
  const azure = azureRaw ? JSON.parse(azureRaw) as { endpoint: string; deployment: string } : null;
  return { key, provider, azure };
}

async function callClaudeApi(body: unknown): Promise<unknown> {
  const { key: userKey, provider, azure } = getAiConfig();
  if (!userKey) {
    throw new Error("NO_API_KEY");
  }

  const extra = azure ? { azureEndpoint: azure.endpoint, azureDeployment: azure.deployment } : {};
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": userKey,
    },
    body: JSON.stringify({ ...(body as object), provider, ...extra }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string; type?: string };
      // Surface Anthropic API errors cleanly
      if (typeof j.error === "string") {
        msg = j.error;
      } else if (j.error && typeof j.error === "object") {
        const ae = j.error as { message?: string };
        if (ae.message?.includes("credit balance")) {
          msg = "Your Anthropic account has no credits. Add credits at console.anthropic.com → Billing.";
        } else if (ae.message) {
          msg = ae.message;
        }
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return JSON.parse(text);
}

function makeCacheKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  cache: {},
  panelOpen: false,
  currentKey: null,
  status: "idle",
  error: null,
  scriptPanelOpen: false,
  scriptResult: null,
  scriptStatus: "idle",
  scriptError: null,

  getCached: (policyIds) => {
    const key = makeCacheKey(policyIds);
    return get().cache[key] ?? null;
  },

  analyze: async (policies) => {
    const key = makeCacheKey(policies.map((p) => p.id));

    // Return cached result
    const cached = get().cache[key];
    if (cached) {
      set({ panelOpen: true, currentKey: key, status: "success", error: null });
      return;
    }

    set({ panelOpen: true, currentKey: key, status: "loading", error: null });

    try {
      const result = await callClaudeApi({
        mode: "analyze",
        policies: policies.map((p) => ({ name: p.name, type: p.type, json: p.json })),
      }) as AnalysisResult;

      set((state) => ({
        cache: {
          ...state.cache,
          [key]: { ...result, analyzedAt: Date.now(), policyIds: policies.map((p) => p.id) },
        },
        status: "success",
        error: null,
      }));
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  generateScript: async (description, scriptType) => {
    set({ scriptPanelOpen: true, scriptStatus: "loading", scriptError: null, scriptResult: null });
    try {
      const result = await callClaudeApi({ mode: "script", description, scriptType }) as ScriptResult;
      set({ scriptResult: result, scriptStatus: "success" });
    } catch (e) {
      set({ scriptStatus: "error", scriptError: (e as Error).message });
    }
  },

  openPanel: (key) => set({ panelOpen: true, currentKey: key }),
  closePanel: () => set({ panelOpen: false }),
  openScriptPanel: () => set({ scriptPanelOpen: true }),
  closeScriptPanel: () => set({ scriptPanelOpen: false, scriptResult: null, scriptStatus: "idle", scriptError: null }),
}));
