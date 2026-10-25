import { create } from "zustand";
import type { Advice, BenchmarkReport, CheckResult } from "../baseline/types";

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
  /** Increments on every start — lets views tell runs apart. */
  runId: number;
  agents: Record<AgentId, AgentState>;
  log: LogEntry[];
  handoff: Handoff | null;
  results: CheckResult[];
  advice: Advice[];
  report: BenchmarkReport | null;
  /** Co-managed devices found (ConfigMgr) — null when unknown. */
  coManaged: boolean | null;
  error: string | null;

  reset: () => void;
  start: () => void;
  finish: (error?: string) => void;
  updateAgent: (id: AgentId, patch: Partial<AgentState>) => void;
  addLog: (agent: AgentId, kind: LogEntry["kind"], text: string) => void;
  handOff: (from: AgentId, to: AgentId, label: string) => void;
  setResults: (patch: Partial<Pick<AgentRunState, "results" | "advice" | "report" | "coManaged">>) => void;
}

let logSeq = 0;
// Global, never reset — animations key off it, so a new run must not reuse an old value.
let handoffSeq = 0;

export const useAgentRunStore = create<AgentRunState>((set) => ({
  running: false,
  runId: 0,
  agents: { collector: idle(), assessor: idle(), advisor: idle(), reporter: idle() },
  log: [],
  handoff: null,
  results: [],
  advice: [],
  report: null,
  coManaged: null,
  error: null,

  reset: () =>
    set({
      agents: { collector: idle(), assessor: idle(), advisor: idle(), reporter: idle() },
      log: [],
      handoff: null,
      results: [],
      advice: [],
      report: null,
      coManaged: null,
      error: null,
    }),
  start: () => set((s) => ({ running: true, error: null, runId: s.runId + 1 })),
  finish: (error) => set({ running: false, error: error ?? null }),
  updateAgent: (id, patch) => set((s) => ({ agents: { ...s.agents, [id]: { ...s.agents[id], ...patch } } })),
  addLog: (agent, kind, text) =>
    set((s) => ({ log: [...s.log, { id: ++logSeq, ts: Date.now(), agent, kind, text }].slice(-400) })),
  handOff: (from, to, label) => set({ handoff: { from, to, label, seq: ++handoffSeq } }),
  setResults: (patch) => set(patch),
}));
