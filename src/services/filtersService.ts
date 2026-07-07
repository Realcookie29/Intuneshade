import { graphGetAll, graphPostWithResponse, graphPatch, graphDelete } from "./graphClient";
import { fetchPolicies } from "./policiesService";
import { buildPolicyRows } from "../utils/assignmentHelpers";
import { getGroupMap, getFilterMap } from "../hooks/useGroups";
import { POLICY_DEFINITIONS } from "../utils/policyConfig";
import type { AssignmentFilter, AssignmentFilterInput } from "../types/graphTypes";
import type { PolicyType } from "../types/policyTypes";

const RESOURCE = "/deviceManagement/assignmentFilters";

/** Full detail for every assignment filter (rule, description, management type). */
export async function fetchFiltersDetailed(): Promise<AssignmentFilter[]> {
  return graphGetAll<AssignmentFilter>(
    `${RESOURCE}?$select=id,displayName,description,platform,rule,assignmentFilterManagementType`
  );
}

export async function createFilter(input: AssignmentFilterInput): Promise<AssignmentFilter> {
  return graphPostWithResponse<AssignmentFilter>(RESOURCE, {
    displayName: input.displayName,
    description: input.description,
    platform: input.platform,
    rule: input.rule,
    assignmentFilterManagementType: input.assignmentFilterManagementType,
  });
}

/**
 * Update an existing filter. Intune only allows name, description and rule to
 * change after creation — platform and management type are immutable.
 */
export async function updateFilter(
  id: string,
  input: Pick<AssignmentFilterInput, "displayName" | "description" | "rule">
): Promise<void> {
  await graphPatch(`${RESOURCE}/${id}`, {
    displayName: input.displayName,
    description: input.description,
    rule: input.rule,
  });
}

export async function deleteFilter(id: string): Promise<void> {
  await graphDelete(`${RESOURCE}/${id}`);
}

export interface FilterUsage {
  /** filterId → list of policies that reference it in an assignment */
  usage: Map<string, { policyId: string; policyName: string; policyType: PolicyType }[]>;
}

/**
 * Scans every policy type and records which policies reference each filter.
 * Reuses the same fetch pipeline as the Policy Map / Group Finder.
 */
export async function scanFilterUsage(
  onProgress?: (done: number, total: number, label: string) => void
): Promise<FilterUsage["usage"]> {
  const gMap = getGroupMap();
  const fMap = getFilterMap();
  const usage = new Map<string, { policyId: string; policyName: string; policyType: PolicyType }[]>();

  for (let i = 0; i < POLICY_DEFINITIONS.length; i++) {
    const def = POLICY_DEFINITIONS[i];
    onProgress?.(i, POLICY_DEFINITIONS.length, def.label);
    try {
      const policies = await fetchPolicies(def.type);
      for (const policy of policies) {
        const rows = buildPolicyRows(policy, gMap, fMap);
        for (const row of rows) {
          if (!row.filterId) continue;
          const list = usage.get(row.filterId) ?? [];
          // Avoid duplicate policy entries for the same filter
          if (!list.some((p) => p.policyId === row.policyId)) {
            list.push({ policyId: row.policyId, policyName: row.policyName, policyType: def.type });
          }
          usage.set(row.filterId, list);
        }
      }
    } catch {
      /* skip failing types */
    }
  }
  onProgress?.(POLICY_DEFINITIONS.length, POLICY_DEFINITIONS.length, "");
  return usage;
}
