import { create } from "zustand";
import type { DetectedConflict, PolicyForSettingCheck } from "../utils/conflictDetection";
import type { PolicyType } from "../types/policyTypes";
import { POLICY_DEFINITIONS } from "../utils/policyConfig";
import { fetchPolicies } from "../services/policiesService";
import { fetchConfigPolicySettings, fetchDeviceConfigDetails } from "../services/settingsService";
import { buildPolicyRows } from "../utils/assignmentHelpers";
import { getGroupMap, getFilterMap } from "../hooks/useGroups";
import { detectConflicts, detectSettingConflicts } from "../utils/conflictDetection";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScanStatus = "idle" | "scanning" | "done" | "error";

interface ConflictState {
  conflicts: DetectedConflict[];
  scanStatus: ScanStatus;
  scanProgress: number;
  scanPhase: string;
  policiesScanned: number;
  scanError: string | null;
  lastScannedAt: number | null;
  resolutions: Record<string, string>;
  resolvingId: string | null;

  scan: () => Promise<void>;
  resolveWithAI: (conflict: DetectedConflict, apiKey: string) => Promise<void>;
  reset: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useConflictStore = create<ConflictState>((set) => ({
  conflicts: [],
  scanStatus: "idle",
  scanProgress: 0,
  scanPhase: "",
  policiesScanned: 0,
  scanError: null,
  lastScannedAt: null,
  resolutions: {},
  resolvingId: null,

  scan: async () => {
    set({
      scanStatus: "scanning",
      scanProgress: 0,
      scanPhase: "Scanning assignments…",
      conflicts: [],
      scanError: null,
      policiesScanned: 0,
    });

    const allConflicts: DetectedConflict[] = [];
    const types = POLICY_DEFINITIONS.map((d) => d.type as PolicyType);
    let totalPolicies = 0;

    // Collect policies for setting-level analysis
    const configPoliciesForSettingCheck: PolicyForSettingCheck[] = [];
    const deviceConfigsForSettingCheck: PolicyForSettingCheck[] = [];

    // Phase 1 — Assignment conflicts across all 10 types (0–75%)
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      set({ scanPhase: `Scanning ${POLICY_DEFINITIONS[i].label}…` });
      try {
        const policies = await fetchPolicies(type);
        totalPolicies += policies.length;
        const gMap = getGroupMap();
        const fMap = getFilterMap();
        const rows = policies.flatMap((p) => buildPolicyRows(p, gMap, fMap));
        allConflicts.push(...detectConflicts(rows, type));

        // Collect Settings Catalog + Device Configurations for setting-level Phase 2
        if (type === "configurationPolicies" || type === "deviceConfigurations") {
          const targetList = type === "configurationPolicies"
            ? configPoliciesForSettingCheck
            : deviceConfigsForSettingCheck;
          for (const policy of policies) {
            const pRows = rows.filter((r) => r.policyId === policy.id);
            const groupIds = [...new Set(pRows.filter((r) => r.groupId).map((r) => r.groupId!))];
            if (groupIds.length === 0) continue;
            const groupNames = Object.fromEntries(
              pRows.filter((r) => r.groupId).map((r) => [r.groupId!, r.groupDisplayName])
            );
            targetList.push({
              id: policy.id,
              name: policy.displayName ?? policy.name ?? policy.id,
              type,
              groupIds,
              groupNames,
              settings: [],
            });
          }
        }
      } catch { /* skip failing types */ }

      set({
        scanProgress: Math.round(((i + 1) / types.length) * 75),
        policiesScanned: totalPolicies,
      });
    }

    // Phase 2 — Setting-level conflicts (75–100%)
    // Only fetch settings for policies that share groups with at least one other policy

    function getPoliciesWithSharedGroups(list: PolicyForSettingCheck[]): Set<string> {
      const groupMap = new Map<string, string[]>();
      for (const p of list) {
        for (const gId of p.groupIds) {
          const arr = groupMap.get(gId) ?? [];
          arr.push(p.id);
          groupMap.set(gId, arr);
        }
      }
      const toFetch = new Set<string>();
      for (const [, ids] of groupMap) {
        if (ids.length >= 2) ids.forEach((id) => toFetch.add(id));
      }
      return toFetch;
    }

    const configToFetch = [...getPoliciesWithSharedGroups(configPoliciesForSettingCheck)];
    const deviceConfigToFetch = [...getPoliciesWithSharedGroups(deviceConfigsForSettingCheck)];
    const totalSettingFetches = configToFetch.length + deviceConfigToFetch.length;

    if (totalSettingFetches > 0) {
      set({ scanPhase: `Analyzing setting conflicts across ${totalSettingFetches} policies…` });

      let fetched = 0;

      // Fetch Settings Catalog settings
      for (const pId of configToFetch) {
        const entry = configPoliciesForSettingCheck.find((p) => p.id === pId);
        if (entry) entry.settings = await fetchConfigPolicySettings(pId);
        fetched++;
        set({ scanProgress: 75 + Math.round((fetched / totalSettingFetches) * 24) });
      }

      // Fetch Device Configuration settings (Update Rings, Device Config profiles, etc.)
      for (const pId of deviceConfigToFetch) {
        const entry = deviceConfigsForSettingCheck.find((p) => p.id === pId);
        if (entry) entry.settings = await fetchDeviceConfigDetails(pId);
        fetched++;
        set({ scanProgress: 75 + Math.round((fetched / totalSettingFetches) * 24) });
      }

      allConflicts.push(...detectSettingConflicts(configPoliciesForSettingCheck));
      allConflicts.push(...detectSettingConflicts(deviceConfigsForSettingCheck));
    }

    set({
      conflicts: allConflicts,
      scanStatus: "done",
      scanProgress: 100,
      scanPhase: "Scan complete",
      policiesScanned: totalPolicies,
      lastScannedAt: Date.now(),
    });
  },

  resolveWithAI: async (conflict, apiKey) => {
    set({ resolvingId: conflict.id });
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({
          mode: "resolve",
          conflict: {
            description: conflict.description,
            policies: conflict.conflictingValues
              ? conflict.conflictingValues.map((v) => v.policyName)
              : [conflict.policyName],
          },
        }),
      });
      const data = await res.json() as { resolution?: string; steps?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "AI resolution failed");

      const text = [
        data.resolution ?? "",
        ...(data.steps ?? []).map((s, i) => `${i + 1}. ${s}`),
      ].filter(Boolean).join("\n");

      set((state) => ({
        resolutions: { ...state.resolutions, [conflict.id]: text },
        resolvingId: null,
      }));
    } catch (e) {
      set((state) => ({
        resolutions: { ...state.resolutions, [conflict.id]: `Error: ${(e as Error).message}` },
        resolvingId: null,
      }));
    }
  },

  reset: () => set({
    conflicts: [],
    scanStatus: "idle",
    scanProgress: 0,
    scanPhase: "",
    policiesScanned: 0,
    lastScannedAt: null,
    resolutions: {},
  }),
}));
