import { buildPolicyRows } from "../utils/assignmentHelpers";
import type { AssignmentRecord, TargetKind, AssignMode } from "./assignmentScanService";
import type { GraphPolicy } from "../types/policyTypes";
import type { PolicyType } from "../types/policyTypes";

export interface ParseResult {
  records: AssignmentRecord[];
  policyCount: number;
  assignedPolicyCount: number;
  fileCount: number;
  unresolvedGroups: number;
  errors: string[];
}

/** Best-effort mapping of a policy @odata.type to one of our policy buckets. */
function inferType(odata: string | undefined, explicit: string | undefined): PolicyType {
  if (explicit) return explicit as PolicyType;
  const t = (odata ?? "").toLowerCase();
  if (t.includes("compliance")) return "deviceCompliancePolicies";
  if (t.includes("configurationpolicy") || t.includes("settingscatalog")) return "configurationPolicies";
  if (t.includes("grouppolicy") || t.includes("admx")) return "groupPolicyConfigurations";
  if (t.includes("healthscript") || t.includes("remediation")) return "deviceHealthScripts";
  if (t.includes("managementscript") || t.includes("shellscript") || t.includes("powershell")) return "deviceManagementScripts";
  if (t.includes("autopilot")) return "windowsAutopilotDeploymentProfiles";
  if (t.includes("appconfiguration")) return "mobileAppConfigurations";
  if (t.includes("intent")) return "deviceManagementIntents";
  if (t.includes("app")) return "mobileApps";
  if (t.includes("deviceconfiguration")) return "deviceConfigurations";
  return "configurationPolicies";
}

/** Pull an array of candidate objects out of whatever JSON shape the file has. */
function extractObjects(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.policies)) return o.policies as Record<string, unknown>[];
    if (Array.isArray(o.value)) return o.value as Record<string, unknown>[];
    return [o];
  }
  return [];
}

function looksLikePolicy(o: Record<string, unknown>): boolean {
  return "assignments" in o || "displayName" in o || "name" in o;
}

/**
 * Parse one or more exported Intune JSON files into normalized assignment
 * records — entirely offline, no Graph calls. Accepts our own export format,
 * raw Graph policy objects, Graph list responses, or arrays of any of these.
 * Group display names are taken from the file when present, otherwise the
 * group ID is shown (the export usually doesn't include names).
 */
export function parseFilesToRecords(files: { name: string; text: string }[]): ParseResult {
  const errors: string[] = [];
  const groupNames = new Map<string, string>();
  const filterNames = new Map<string, string>();
  const policies: { obj: Record<string, unknown>; type: PolicyType }[] = [];

  for (const f of files) {
    let data: unknown;
    try {
      data = JSON.parse(f.text);
    } catch {
      errors.push(`${f.name}: not valid JSON`);
      continue;
    }

    // Harvest embedded name maps (our export adds top-level `groups`/`filters`).
    const top = data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
    for (const key of ["groups", "_groups"] as const) {
      const arr = top?.[key];
      if (Array.isArray(arr)) for (const g of arr) {
        const id = (g as Record<string, unknown>)?.id as string | undefined;
        const dn = (g as Record<string, unknown>)?.displayName as string | undefined;
        if (id && dn) groupNames.set(id, dn);
      }
    }
    if (Array.isArray(top?.filters)) for (const g of top!.filters as Record<string, unknown>[]) {
      const id = g?.id as string | undefined;
      const dn = g?.displayName as string | undefined;
      if (id && dn) filterNames.set(id, dn);
    }

    for (const obj of extractObjects(data)) {
      if (!obj || typeof obj !== "object") continue;
      // Collect any id → displayName pairs to resolve group names offline.
      const id = obj.id as string | undefined;
      const displayName = obj.displayName as string | undefined;
      if (id && displayName && !("assignments" in obj)) groupNames.set(id, displayName);

      if (looksLikePolicy(obj)) {
        policies.push({
          obj,
          type: inferType(obj["@odata.type"] as string | undefined, obj._policyType as string | undefined),
        });
      }
    }
  }

  const records: AssignmentRecord[] = [];
  let assignedPolicyCount = 0;
  const unresolved = new Set<string>();

  for (const { obj, type } of policies) {
    const rows = buildPolicyRows(obj as unknown as GraphPolicy, groupNames, filterNames);
    const assigned = rows.filter((r) => r.assignmentType !== "No Assignment");
    if (assigned.length > 0) assignedPolicyCount++;

    for (const r of assigned) {
      let targetKind: TargetKind;
      let mode: AssignMode = "include";
      if (r.assignmentType === "All Users") targetKind = "allUsers";
      else if (r.assignmentType === "All Devices") targetKind = "allDevices";
      else {
        targetKind = "group";
        if (r.assignmentType === "Exclude") mode = "exclude";
      }
      if (targetKind === "group" && r.groupId && r.groupId === r.groupDisplayName) {
        unresolved.add(r.groupId);
      }
      records.push({
        policyId: r.policyId,
        policyName: r.policyName,
        policyType: type,
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

  return {
    records,
    policyCount: policies.length,
    assignedPolicyCount,
    fileCount: files.length,
    unresolvedGroups: unresolved.size,
    errors,
  };
}
