import { create } from "zustand";
import type { BreakGlassAccount, ManualAnswer } from "../baseline/types";
import { CHECKS } from "../baseline";

/**
 * User input for the CIS benchmark: which checks to run, break-glass accounts,
 * scan options and answers to manual checks. Kept in this browser only (localStorage); nothing
 * is sent anywhere.
 */
export type ChecksPreset = "all" | "entra" | "intune";

interface BenchmarkPrefsState {
  /** Check ids the admin switched off. Stored as exclusions so new checks are on by default. */
  excludedChecks: string[];
  setChecks: (ids: string[], on: boolean) => void;
  applyPreset: (preset: ChecksPreset) => void;
  breakGlass: BreakGlassAccount[];
  fullPerUserMfaScan: boolean;
  manualAnswers: Record<string, ManualAnswer>;
  addBreakGlass: (a: BreakGlassAccount) => void;
  removeBreakGlass: (id: string) => void;
  setFullScan: (v: boolean) => void;
  setManualAnswer: (id: string, answer: ManualAnswer | null) => void;
}

const KEY = "intuneshade.benchmarkPrefs";

type Persisted = Pick<BenchmarkPrefsState, "excludedChecks" | "breakGlass" | "fullPerUserMfaScan" | "manualAnswers">;

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
    localStorage.setItem(KEY, JSON.stringify({ excludedChecks: s.excludedChecks, breakGlass: s.breakGlass, fullPerUserMfaScan: s.fullPerUserMfaScan, manualAnswers: s.manualAnswers }));
  } catch { /* ignore */ }
}

const saved = load();

const INTUNE_AREAS = new Set(["Intune"]);

export const useBenchmarkPrefs = create<BenchmarkPrefsState>((set, get) => ({
  excludedChecks: Array.isArray(saved.excludedChecks) ? saved.excludedChecks.filter((x) => typeof x === "string") : [],
  setChecks: (ids, on) => {
    set((s) => {
      const next = new Set(s.excludedChecks);
      for (const id of ids) if (on) next.delete(id); else next.add(id);
      return { excludedChecks: [...next] };
    });
    save(get());
  },
  applyPreset: (preset) => {
    const keep = (area: string) => preset === "all" || (preset === "intune" ? INTUNE_AREAS.has(area) : !INTUNE_AREAS.has(area));
    set({ excludedChecks: CHECKS.filter((c) => !keep(c.area)).map((c) => c.id) });
    save(get());
  },
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
