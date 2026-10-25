import { create } from "zustand";
import { callAiProxy } from "../services/ai/aiProxy";
import { stripSensitive } from "../services/ai/sanitize";

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

async function callClaudeApi(body: Record<string, unknown>): Promise<unknown> {
  return callAiProxy(body);
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
        policies: policies.map((p) => ({ name: p.name, type: p.type, json: stripSensitive(p.json) })),
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
