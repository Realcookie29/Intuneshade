import { create } from "zustand";
import type { BreakGlassAccount, ManualAnswer } from "../baseline/types";

/**
 * User input for the CIS benchmark: break-glass accounts, scan options and
 * answers to manual checks. Kept in this browser only (localStorage); nothing
 * is sent anywhere.
 */
interface BenchmarkPrefsState {
  breakGlass: BreakGlassAccount[];
  fullPerUserMfaScan: boolean;
  manualAnswers: Record<string, ManualAnswer>;
  addBreakGlass: (a: BreakGlassAccount) => void;
  removeBreakGlass: (id: string) => void;
  setFullScan: (v: boolean) => void;
  setManualAnswer: (id: string, answer: ManualAnswer | null) => void;
}

const KEY = "intuneshade.benchmarkPrefs";

type Persisted = Pick<BenchmarkPrefsState, "breakGlass" | "fullPerUserMfaScan" | "manualAnswers">;

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function save(s: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ breakGlass: s.breakGlass, fullPerUserMfaScan: s.fullPerUserMfaScan, manualAnswers: s.manualAnswers }));
  } catch { /* ignore */ }
}

const saved = load();

export const useBenchmarkPrefs = create<BenchmarkPrefsState>((set, get) => ({
  breakGlass: Array.isArray(saved.breakGlass) ? saved.breakGlass : [],
  fullPerUserMfaScan: saved.fullPerUserMfaScan === true,
  manualAnswers: saved.manualAnswers && typeof saved.manualAnswers === "object" ? saved.manualAnswers : {},
  addBreakGlass: (a) => {
    if (get().breakGlass.some((b) => b.id === a.id)) return;
    set((s) => ({ breakGlass: [...s.breakGlass, a] }));
    save(get());
  },
  removeBreakGlass: (id) => {
    set((s) => ({ breakGlass: s.breakGlass.filter((b) => b.id !== id) }));
    save(get());
  },
  setFullScan: (v) => {
    set({ fullPerUserMfaScan: v });
    save(get());
  },
  setManualAnswer: (id, answer) => {
    set((s) => {
      const next = { ...s.manualAnswers };
      if (answer) next[id] = answer;
      else delete next[id];
      return { manualAnswers: next };
    });
    save(get());
  },
}));
