import { create } from "zustand";
import { graphGetCount } from "../services/graphClient";
import { scanTenantHealth, summarize, type TenantStats } from "../services/assignmentScanService";
import { fetchAuditEvents } from "../services/auditService";
import type { AuditEvent } from "../types/graphTypes";

type Status = "idle" | "scanning" | "done";

async function checkEmptyGroups(groupIds: string[]): Promise<number> {
  const ids = groupIds.slice(0, 500);
  let empty = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < ids.length) {
      const id = ids[idx++];
      try {
        if ((await graphGetCount(`/groups/${id}/members/$count`)) === 0) empty++;
      } catch { /* ignore */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, ids.length) }, worker));
  return empty;
}

interface DashboardState {
  status: Status;
  progress: number;
  phase: string;
  stats: TenantStats | null;
  emptyGroups: number | null;
  checkingEmpty: boolean;
  recent: AuditEvent[];
  recentLoaded: boolean;
  scan: (force?: boolean) => Promise<void>;
  ensureLoaded: () => void;
  loadRecent: () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  status: "idle",
  progress: 0,
  phase: "",
  stats: null,
  emptyGroups: null,
  checkingEmpty: false,
  recent: [],
  recentLoaded: false,

  scan: async (force = false) => {
    const s = get();
    if (s.status === "scanning") return;
    if (s.status === "done" && !force) return;

    set({ status: "scanning", progress: 0, emptyGroups: null });
    try {
      const health = await scanTenantHealth((done, total, label) =>
        set({ progress: Math.round((done / total) * 100), phase: label })
      );
      const stats = summarize(health.records);
      stats.unassignedPolicies = health.unassigned.length;
      stats.totalPolicies = health.totalPolicies;
      set({ stats, status: "done" });

      const targeted = [
        ...new Set(
          health.records
            .filter((r) => r.targetKind === "group" && r.groupId)
            .map((r) => r.groupId as string)
        ),
      ];
      set({ checkingEmpty: true });
      checkEmptyGroups(targeted)
        .then((n) => set({ emptyGroups: n }))
        .finally(() => set({ checkingEmpty: false }));
    } catch {
      set({ status: "idle" });
    }
  },

  // Auto-load once per session (fired when Home first mounts, e.g. after login).
  ensureLoaded: () => {
    if (get().status === "idle") get().scan();
  },

  loadRecent: () => {
    if (get().recentLoaded) return;
    set({ recentLoaded: true });
    fetchAuditEvents(8)
      .then((r) => set({ recent: r }))
      .catch(() => undefined);
  },
}));
