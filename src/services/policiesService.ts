import { graphGetAll, graphGet, graphPostWithResponse } from "./graphClient";
import type { GraphGroup, AssignmentFilter } from "../types/graphTypes";
import type { GraphPolicy, PolicyType } from "../types/policyTypes";
import { getPolicyDefinition } from "../utils/policyConfig";

export async function fetchAllGroups(): Promise<GraphGroup[]> {
  return graphGetAll<GraphGroup>(
    "/groups?$filter=securityEnabled eq true&$select=id,displayName&$top=999"
  );
}

/**
 * Resolve display names for arbitrary group IDs via directoryObjects/getByIds.
 * Used to backfill names for groups that aren't in the security-group cache
 * (e.g. Microsoft 365 groups assigned to a policy). Batches in chunks of 1000.
 */
export async function fetchGroupNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);

  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    try {
      const res = await graphPostWithResponse<{ value: { id: string; displayName?: string }[] }>(
        "/directoryObjects/getByIds",
        { ids: chunk, types: ["group"] }
      );
      for (const obj of res.value ?? []) {
        if (obj.displayName) result.set(obj.id, obj.displayName);
      }
    } catch {
      /* leave this chunk unresolved — caller falls back to the ID */
    }
  }

  return result;
}

export async function fetchAssignmentFilters(): Promise<AssignmentFilter[]> {
  return graphGetAll<AssignmentFilter>(
    "/deviceManagement/assignmentFilters?$select=id,displayName,platform"
  );
}

export async function fetchPolicies(type: PolicyType): Promise<GraphPolicy[]> {
  const def = getPolicyDefinition(type);
  const ns = def.namespace;

  if (def.fetchAssignmentsViaExpand) {
    return graphGetAll<GraphPolicy>(`/${ns}/${type}?$expand=assignments`);
  }

  if (type === "configurationPolicies") {
    const policies = await graphGetAll<GraphPolicy>(
      `/deviceManagement/configurationPolicies?$select=id,name,description,platforms`
    );
    await Promise.all(
      policies.map(async (p) => {
        try {
          const assignments = await graphGetAll<NonNullable<GraphPolicy["assignments"]>[number]>(
            `/deviceManagement/configurationPolicies('${p.id}')/assignments`
          );
          p.assignments = assignments;
        } catch {
          p.assignments = [];
        }
      })
    );
    return policies;
  }

  if (type === "deviceManagementIntents") {
    const policies = await graphGetAll<GraphPolicy>(
      `/deviceManagement/intents?$select=id,displayName,description,isAssigned`
    );
    await Promise.all(
      policies.map(async (p) => {
        try {
          const result = await graphGet<{ value: NonNullable<GraphPolicy["assignments"]> }>(
            `/deviceManagement/intents/${p.id}/assignments`
          );
          p.assignments = result.value ?? [];
        } catch {
          p.assignments = [];
        }
      })
    );
    return policies;
  }

  return [];
}
