import { fetchPolicies, fetchGroupNamesByIds } from "./policiesService";
import { buildPolicyRows } from "../utils/assignmentHelpers";
import { getGroupMap, getFilterMap, mergeGroupNames } from "../hooks/useGroups";
import { POLICY_DEFINITIONS } from "../utils/policyConfig";
import type { PolicyType } from "../types/policyTypes";

export type TargetKind = "group" | "allUsers" | "allDevices";
export type AssignMode = "include" | "exclude";

/** One normalized policy → target assignment, flattened across all policy types. */
export interface AssignmentRecord {
  policyId: string;
  policyName: string;
  policyType: PolicyType;
  targetKind: TargetKind;
  groupId: string | null;
  groupName: string;
  mode: AssignMode;
  filterId: string | null;
  filterName: string;
  installIntent: string;
}

export type ScanProgress = (done: number, total: number, label: string) => void;

// Session cache so the dashboard, report, matrix and compare pages share one
// scan. `inFlight` dedupes concurrent callers (e.g. the login warm-up and a
// page opened immediately after) so the tenant is only scanned once.
let cached: AssignmentRecord[] | null = null;
let inFlight: Promise<AssignmentRecord[]> | null = null;

/** Returns the cached assignment scan, running it once on first use. */
export async function getAssignments(onProgress?: ScanProgress, force = false): Promise<AssignmentRecord[]> {
  if (cached && !force) return cached;
  if (inFlight && !force) return inFlight;

  const run = (async () => {
    const records = await scanAllAssignments(onProgress);
    cached = records;
    return records;
  })();
  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
}

export function isAssignmentsCached(): boolean {
  return cached !== null;
}

export function clearAssignmentsCache(): void {
  cached = null;
}

/**
 * Backfill display names for any group that only resolved to a bare ID (e.g.
 * Microsoft 365 groups not in the security-group cache, or a scan that ran
 * before the group cache finished loading). Mutates records in place and feeds
 * the resolved names back into the shared group cache. Runs once per scan.
 */
async function resolveRecordNames(records: AssignmentRecord[]): Promise<void> {
  const missing = records
    .filter((r) => r.targetKind === "group" && r.groupId && r.groupName === r.groupId)
    .map((r) => r.groupId as string);
  if (missing.length === 0) return;

  const resolved = await fetchGroupNamesByIds(missing);
  if (resolved.size === 0) return;

  mergeGroupNames(resolved);
  for (const r of records) {
    if (r.groupId && resolved.has(r.groupId)) r.groupName = resolved.get(r.groupId)!;
  }
}

/**
 * Fetches every policy across all types and flattens their assignments into a
 * single normalized list. This is the shared data source for the dashboard,
 * the assignment matrix and the device/user compare engine.
 */
export async function scanAllAssignments(onProgress?: ScanProgress): Promise<AssignmentRecord[]> {
  const gMap = getGroupMap();
  const fMap = getFilterMap();
  const records: AssignmentRecord[] = [];

  for (let i = 0; i < POLICY_DEFINITIONS.length; i++) {
    const def = POLICY_DEFINITIONS[i];
    onProgress?.(i, POLICY_DEFINITIONS.length, def.label);
    try {
      const policies = await fetchPolicies(def.type);
      for (const policy of policies) {
        for (const r of buildPolicyRows(policy, gMap, fMap)) {
          if (r.assignmentType === "No Assignment") continue;

          let targetKind: TargetKind;
          let mode: AssignMode = "include";
          if (r.assignmentType === "All Users") targetKind = "allUsers";
          else if (r.assignmentType === "All Devices") targetKind = "allDevices";
          else {
            targetKind = "group";
            if (r.assignmentType === "Exclude") mode = "exclude";
          }

          records.push({
            policyId: r.policyId,
            policyName: r.policyName,
            policyType: def.type,
            targetKind,
            groupId: r.groupId,
            groupName: r.groupDisplayName,
            mode,
            filterId: r.filterId,
            filterName: r.filterDisplayName,
            installIntent: r.installIntent,
          });
        }
      }
    } catch {
      /* skip a whole type that fails */
    }
  }
  onProgress?.(POLICY_DEFINITIONS.length, POLICY_DEFINITIONS.length, "");
  await resolveRecordNames(records);
  return records;
}

export interface TenantHealth {
  records: AssignmentRecord[];
  totalPolicies: number;
  unassigned: { policyId: string; policyName: string; policyType: PolicyType }[];
}

/**
 * A deeper scan for the dashboard that also tracks the total policy count and
 * which policies have no assignment at all. Populates the shared cache so the
 * compare pages can reuse the assignment records without rescanning.
 */
export async function scanTenantHealth(onProgress?: ScanProgress): Promise<TenantHealth> {
  // Publish an in-flight promise so a report/matrix/compare page opened while
  // this login warm-up is still running awaits it instead of scanning again.
  let settle: (r: AssignmentRecord[]) => void = () => {};
  const mine = new Promise<AssignmentRecord[]>((res) => { settle = res; });
  inFlight = mine;

  const gMap = getGroupMap();
  const fMap = getFilterMap();
  const records: AssignmentRecord[] = [];
  const unassigned: TenantHealth["unassigned"] = [];
  let totalPolicies = 0;

  for (let i = 0; i < POLICY_DEFINITIONS.length; i++) {
    const def = POLICY_DEFINITIONS[i];
    onProgress?.(i, POLICY_DEFINITIONS.length, def.label);
    try {
      const policies = await fetchPolicies(def.type);
      for (const policy of policies) {
        totalPolicies++;
        const rows = buildPolicyRows(policy, gMap, fMap);
        const assigned = rows.filter((r) => r.assignmentType !== "No Assignment");
        if (assigned.length === 0) {
          const head = rows[0];
          if (head) unassigned.push({ policyId: head.policyId, policyName: head.policyName, policyType: def.type });
          continue;
        }
        for (const r of assigned) {
          let targetKind: TargetKind;
          let mode: AssignMode = "include";
          if (r.assignmentType === "All Users") targetKind = "allUsers";
          else if (r.assignmentType === "All Devices") targetKind = "allDevices";
          else {
            targetKind = "group";
            if (r.assignmentType === "Exclude") mode = "exclude";
          }
          records.push({
            policyId: r.policyId, policyName: r.policyName, policyType: def.type,
            targetKind, groupId: r.groupId, groupName: r.groupDisplayName, mode,
            filterId: r.filterId, filterName: r.filterDisplayName, installIntent: r.installIntent,
          });
        }
      }
    } catch {
      /* skip type */
    }
  }
  onProgress?.(POLICY_DEFINITIONS.length, POLICY_DEFINITIONS.length, "");
  await resolveRecordNames(records);
  cached = records; // share with the compare pages
  settle(records);
  if (inFlight === mine) inFlight = null;
  return { records, totalPolicies, unassigned };
}

// ─── Derived views used by the dashboard ────────────────────────────────────

export interface TenantStats {
  totalPolicies: number;
  assignedPolicies: number;
  unassignedPolicies: number; // captured separately (needs the raw list)
  byType: { type: PolicyType; label: string; count: number }[];
  groupsTargeted: number;
  broadAssignments: { policyId: string; policyName: string; policyType: PolicyType; scope: "All Users" | "All Devices" }[];
  topGroups: { groupId: string; groupName: string; count: number }[];
}

/** Aggregates scan records into the headline numbers shown on the dashboard. */
export function summarize(records: AssignmentRecord[]): TenantStats {
  const policyIds = new Set(records.map((r) => r.policyId));
  const byTypeMap = new Map<PolicyType, Set<string>>();
  const groupCounts = new Map<string, { name: string; ids: Set<string> }>();
  const broad: TenantStats["broadAssignments"] = [];

  for (const r of records) {
    if (!byTypeMap.has(r.policyType)) byTypeMap.set(r.policyType, new Set());
    byTypeMap.get(r.policyType)!.add(r.policyId);

    if (r.targetKind === "group" && r.groupId && r.mode === "include") {
      const g = groupCounts.get(r.groupId) ?? { name: r.groupName, ids: new Set<string>() };
      g.ids.add(r.policyId);
      groupCounts.set(r.groupId, g);
    }
    if (r.targetKind === "allUsers" || r.targetKind === "allDevices") {
      broad.push({
        policyId: r.policyId,
        policyName: r.policyName,
        policyType: r.policyType,
        scope: r.targetKind === "allUsers" ? "All Users" : "All Devices",
      });
    }
  }

  const byType = POLICY_DEFINITIONS.map((d) => ({
    type: d.type,
    label: d.label,
    count: byTypeMap.get(d.type)?.size ?? 0,
  }));

  const topGroups = [...groupCounts.entries()]
    .map(([groupId, v]) => ({ groupId, groupName: v.name, count: v.ids.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalPolicies: policyIds.size,
    assignedPolicies: policyIds.size,
    unassignedPolicies: 0,
    byType,
    groupsTargeted: groupCounts.size,
    broadAssignments: broad,
    topGroups,
  };
}
