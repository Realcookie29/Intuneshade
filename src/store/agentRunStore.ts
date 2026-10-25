import { create } from "zustand";
import type { Advice, BenchmarkReport, Finding, Profile, TenantSnapshot } from "../baseline/types";

export type AgentId = "collector" | "assessor" | "advisor" | "reporter";
export type AgentStatus = "idle" | "working" | "done" | "error";

export interface AgentState {
  status: AgentStatus;
  task: string;
  /** 0–1 */
  progress: number;
  /** Short result line shown on the card when done, e.g. "38 findings". */
  output?: string;
}

export interface LogEntry {
  id: number;
  ts: number;
  agent: AgentId;
  kind: "info" | "graph" | "ai" | "warn" | "error";
  text: string;
}

export interface Handoff {
  from: AgentId;
  to: AgentId;
  label: string;
  /** Changes on every hand-off so the animation restarts. */
  seq: number;
}

const idle = (): AgentState => ({ status: "idle", task: "Waiting", progress: 0 });

interface AgentRunState {
  running: boolean;
  profile: Profile;
  agents: Record<AgentId, AgentState>;
  log: LogEntry[];
  handoff: Handoff | null;
  snapshot: TenantSnapshot | null;
  findings: Finding[];
  advice: Advice[];
  report: BenchmarkReport | null;
  error: string | null;

  setProfile: (p: Profile) => void;
  reset: () => void;
  start: () => void;
  finish: (error?: string) => void;
  updateAgent: (id: AgentId, patch: Partial<AgentState>) => void;
  addLog: (agent: AgentId, kind: LogEntry["kind"], text: string) => void;
  handOff: (from: AgentId, to: AgentId, label: string) => void;
  setResults: (patch: Partial<Pick<AgentRunState, "snapshot" | "findings" | "advice" | "report">>) => void;
}

let logSeq = 0;

export const useAgentRunStore = create<AgentRunState>((set) => ({
  running: false,
  profile: "L1",
  agents: { collector: idle(), assessor: idle(), advisor: idle(), reporter: idle() },
  log: [],
  handoff: null,
  snapshot: null,
  findings: [],
  advice: [],
  report: null,
  error: null,

  setProfile: (profile) => set({ profile }),
  reset: () =>
    set({
      agents: { collector: idle(), assessor: idle(), advisor: idle(), reporter: idle() },
      log: [],
      handoff: null,
      snapshot: null,
      findings: [],
      advice: [],
      report: null,
      error: null,
    }),
  start: () => set({ running: true, error: null }),
  finish: (error) => set({ running: false, error: error ?? null }),
  updateAgent: (id, patch) => set((s) => ({ agents: { ...s.agents, [id]: { ...s.agents[id], ...patch } } })),
  addLog: (agent, kind, text) =>
    set((s) => ({ log: [...s.log, { id: ++logSeq, ts: Date.now(), agent, kind, text }].slice(-400) })),
  handOff: (from, to, label) =>
    set((s) => ({ handoff: { from, to, label, seq: (s.handoff?.seq ?? 0) + 1 } })),
  setResults: (patch) => set(patch),
}));
