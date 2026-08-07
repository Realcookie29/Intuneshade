import { create } from "zustand";

/**
 * Per-object migration progress for the memberOf page.
 *
 * Entra has nowhere to record "an admin has looked at this group", and the
 * migration runs over weeks across several people, so the ticks live in
 * localStorage on the admin's machine. Object IDs are tenant-unique GUIDs, so
 * entries from different tenants can share one store without colliding.
 *
 * This is browser-local and not shared between admins — the CSV export carries
 * the state when it needs to be handed over.
 */

const STORAGE_KEY = "memberof.progress.v1";

export interface ProgressEntry {
  /** Someone has reviewed this rule and understands what it does. */
  checked: boolean;
  /** The rule has actually been migrated off memberOf. */
  done: boolean;
  /** ISO date of the last change, shown as "marked on …". */
  updated: string;
}

type ProgressMap = Record<string, ProgressEntry>;

function load(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ProgressMap;
  } catch {
    return {};
  }
}

function persist(map: ProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private mode or a full quota — the ticks just don't survive a reload */
  }
}

interface ProgressState {
  entries: ProgressMap;
  get: (id: string) => ProgressEntry;
  /** Toggling "done" on implies "checked"; clearing "checked" clears "done". */
  setChecked: (id: string, value: boolean) => void;
  setDone: (id: string, value: boolean) => void;
  clearAll: () => void;
  /** How many of the given IDs are checked / done. */
  countFor: (ids: string[]) => { checked: number; done: number };
}

const EMPTY: ProgressEntry = { checked: false, done: false, updated: "" };

export const useMemberOfProgress = create<ProgressState>((set, get) => ({
  entries: load(),

  get: (id) => get().entries[id] ?? EMPTY,

  setChecked: (id, value) =>
    set((s) => {
      const prev = s.entries[id] ?? EMPTY;
      const next: ProgressMap = {
        ...s.entries,
        [id]: {
          checked: value,
          done: value ? prev.done : false,
          updated: new Date().toISOString(),
        },
      };
      persist(next);
      return { entries: next };
    }),

  setDone: (id, value) =>
    set((s) => {
      const prev = s.entries[id] ?? EMPTY;
      const next: ProgressMap = {
        ...s.entries,
        [id]: {
          checked: value ? true : prev.checked,
          done: value,
          updated: new Date().toISOString(),
        },
      };
      persist(next);
      return { entries: next };
    }),

  clearAll: () =>
    set(() => {
      persist({});
      return { entries: {} };
    }),

  countFor: (ids) => {
    const { entries } = get();
    let checked = 0;
    let done = 0;
    for (const id of ids) {
      const e = entries[id];
      if (!e) continue;
      if (e.done) done++;
      else if (e.checked) checked++;
    }
    return { checked, done };
  },
}));
