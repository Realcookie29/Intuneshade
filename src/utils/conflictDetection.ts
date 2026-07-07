import type { PolicyRow, PolicyType } from "../types/policyTypes";
import type { PolicySetting } from "../services/settingsService";
import { formatSettingName } from "../services/settingsService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConflictSeverity = "critical" | "warning" | "info";
export type ConflictType = "include_exclude" | "intent" | "duplicate" | "redundant" | "setting_value";

export interface ConflictingValue {
  policyId: string;
  policyName: string;
  value: string;
}

export interface DetectedConflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  policyId: string;
  policyName: string;
  policyType: PolicyType;
  groupName: string;
  description: string;
  affectedRows: PolicyRow[];
  // Setting conflict fields
  settingId?: string;
  settingName?: string;
  conflictingValues?: ConflictingValue[];
}

// ─── Assignment Conflict Detection ────────────────────────────────────────────

export function detectConflicts(
  rows: PolicyRow[],
  policyType: PolicyType
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  const byPolicy = new Map<string, PolicyRow[]>();
  for (const row of rows) {
    const arr = byPolicy.get(row.policyId) ?? [];
    arr.push(row);
    byPolicy.set(row.policyId, arr);
  }

  for (const [policyId, policyRows] of byPolicy) {
    const policyName = policyRows[0].policyName;

    // 1. Include + Exclude on the same group
    const includeGroups = new Set(
      policyRows.filter((r) => r.assignmentType === "Include" && r.groupId).map((r) => r.groupId!)
    );
    const excludeRows = policyRows.filter(
      (r) => r.assignmentType === "Exclude" && r.groupId && includeGroups.has(r.groupId)
    );
    for (const excRow of excludeRows) {
      const incRow = policyRows.find(
        (r) => r.assignmentType === "Include" && r.groupId === excRow.groupId
      )!;
      conflicts.push({
        id: `${policyId}-incexc-${excRow.groupId}`,
        type: "include_exclude",
        severity: "critical",
        policyId,
        policyName,
        policyType,
        groupName: excRow.groupDisplayName,
        description: `"${excRow.groupDisplayName}" is both included and excluded in "${policyName}". The exclusion wins — this policy never applies to this group.`,
        affectedRows: [incRow, excRow],
      });
    }

    // 2. App intent conflict (Required vs Available for same group)
    if (policyType === "mobileApps") {
      const intentByGroup = new Map<string, Set<string>>();
      for (const row of policyRows) {
        if (!row.groupId || !row.installIntent) continue;
        const set = intentByGroup.get(row.groupId) ?? new Set();
        set.add(row.installIntent);
        intentByGroup.set(row.groupId, set);
      }
      for (const [groupId, intents] of intentByGroup) {
        if (intents.has("required") && intents.has("available")) {
          const affectedRows = policyRows.filter((r) => r.groupId === groupId);
          conflicts.push({
            id: `${policyId}-intent-${groupId}`,
            type: "intent",
            severity: "warning",
            policyId,
            policyName,
            policyType,
            groupName: affectedRows[0].groupDisplayName,
            description: `"${policyName}" is assigned as both Required and Available to "${affectedRows[0].groupDisplayName}". Required takes precedence but this creates confusion.`,
            affectedRows,
          });
        }
      }
    }

    // 3. Duplicate assignments
    const seen = new Map<string, PolicyRow>();
    for (const row of policyRows) {
      if (!row.groupId) continue;
      const key = `${row.groupId}-${row.assignmentType}-${row.installIntent}`;
      if (seen.has(key)) {
        conflicts.push({
          id: `${policyId}-dup-${key}`,
          type: "duplicate",
          severity: "warning",
          policyId,
          policyName,
          policyType,
          groupName: row.groupDisplayName,
          description: `"${row.groupDisplayName}" is assigned to "${policyName}" more than once with identical settings. One assignment is redundant.`,
          affectedRows: [seen.get(key)!, row],
        });
      } else {
        seen.set(key, row);
      }
    }

    // 4. All Users/All Devices + specific group (redundant)
    const hasAllUsers = policyRows.some((r) => r.assignmentType === "All Users");
    const hasAllDevices = policyRows.some((r) => r.assignmentType === "All Devices");
    const specificIncludes = policyRows.filter((r) => r.assignmentType === "Include" && r.groupId);
    if ((hasAllUsers || hasAllDevices) && specificIncludes.length > 0) {
      const broadType = hasAllUsers ? "All Users" : "All Devices";
      for (const row of specificIncludes) {
        conflicts.push({
          id: `${policyId}-redundant-${row.groupId}`,
          type: "redundant",
          severity: "info",
          policyId,
          policyName,
          policyType,
          groupName: row.groupDisplayName,
          description: `"${policyName}" targets ${broadType} and also specifically targets "${row.groupDisplayName}". The group-specific assignment is redundant.`,
          affectedRows: [row],
        });
      }
    }
  }

  return conflicts;
}

// ─── Setting-Level Conflict Detection ─────────────────────────────────────────

export interface PolicyForSettingCheck {
  id: string;
  name: string;
  type: PolicyType;
  groupIds: string[];
  groupNames: Record<string, string>;
  settings: PolicySetting[];
}

export function detectSettingConflicts(
  policies: PolicyForSettingCheck[]
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const seen = new Set<string>();

  // Build: groupId → policies targeting that group
  const groupToPolicies = new Map<string, PolicyForSettingCheck[]>();
  for (const policy of policies) {
    for (const groupId of policy.groupIds) {
      const arr = groupToPolicies.get(groupId) ?? [];
      arr.push(policy);
      groupToPolicies.set(groupId, arr);
    }
  }

  for (const [groupId, groupPolicies] of groupToPolicies) {
    if (groupPolicies.length < 2) continue;

    // Build: settingId → values per policy
    const settingMap = new Map<string, ConflictingValue[]>();
    for (const policy of groupPolicies) {
      for (const setting of policy.settings) {
        const arr = settingMap.get(setting.settingDefinitionId) ?? [];
        // Only add if this policy isn't already represented for this setting
        if (!arr.find((v) => v.policyId === policy.id)) {
          arr.push({ policyId: policy.id, policyName: policy.name, value: setting.rawValue });
        }
        settingMap.set(setting.settingDefinitionId, arr);
      }
    }

    for (const [settingId, values] of settingMap) {
      if (values.length < 2) continue;

      const uniqueValues = new Set(values.map((v) => v.value));
      if (uniqueValues.size < 2) continue; // Same value — no conflict

      // Deduplicate across groups
      const dedupeKey = [...values.map((v) => v.policyId).sort(), settingId].join("|");
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const groupName = groupPolicies[0].groupNames[groupId] ?? groupId;
      const settingName = formatSettingName(settingId);

      conflicts.push({
        id: `setting-${dedupeKey}-${groupId}`,
        type: "setting_value",
        severity: "critical",
        policyId: values[0].policyId,
        policyName: values[0].policyName,
        policyType: groupPolicies[0].type,
        groupName,
        description: `Setting "${settingName}" is configured with conflicting values across policies targeting "${groupName}".`,
        affectedRows: [],
        settingId,
        settingName,
        conflictingValues: values,
      });
    }
  }

  return conflicts;
}
