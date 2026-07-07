import { graphGet, graphGetAll } from "./graphClient";
import type { ManagedDevice, DirectoryMember, GraphListResponse } from "../types/graphTypes";
import type { AssignmentRecord } from "./assignmentScanService";
import type { PolicyType } from "../types/policyTypes";

// ─── Device & user lookup ────────────────────────────────────────────────────

const esc = (s: string) => s.trim().replace(/'/g, "''");

/** Best-effort autocomplete for managed devices (falls back to empty on filter errors). */
export async function searchDevices(query: string): Promise<ManagedDevice[]> {
  const q = esc(query);
  if (!q) return [];
  return graphGetAll<ManagedDevice>(
    `/deviceManagement/managedDevices?$filter=startswith(deviceName,'${q}')` +
      `&$select=id,deviceName,operatingSystem,osVersion,model,userPrincipalName,azureADDeviceId,complianceState&$top=25`
  ).catch(() => [] as ManagedDevice[]);
}

export async function searchUsers(query: string): Promise<DirectoryMember[]> {
  const q = esc(query);
  if (!q) return [];
  return graphGetAll<DirectoryMember>(
    `/users?$select=id,displayName,userPrincipalName,mail,jobTitle` +
      `&$filter=startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')&$top=25`
  ).catch(() => [] as DirectoryMember[]);
}

/** Groups a user belongs to (transitive — includes nested + dynamic). */
async function userGroupIds(userId: string): Promise<{ id: string; displayName: string }[]> {
  return graphGetAll<{ id: string; displayName: string }>(
    `/users/${userId}/transitiveMemberOf/microsoft.graph.group?$select=id,displayName&$top=999`
  );
}

/** Groups an Entra device object belongs to (transitive). */
async function deviceGroupIds(deviceObjectId: string): Promise<{ id: string; displayName: string }[]> {
  return graphGetAll<{ id: string; displayName: string }>(
    `/devices/${deviceObjectId}/transitiveMemberOf/microsoft.graph.group?$select=id,displayName&$top=999`
  );
}

export interface ResolvedDevice {
  device: ManagedDevice;
  entraObjectId: string | null;
  groups: { id: string; displayName: string }[];
  warnings: string[];
}

export async function resolveDevice(deviceName: string): Promise<ResolvedDevice> {
  const q = esc(deviceName);
  const matches = await graphGetAll<ManagedDevice>(
    `/deviceManagement/managedDevices?$filter=deviceName eq '${q}'` +
      `&$select=id,deviceName,operatingSystem,osVersion,model,manufacturer,userPrincipalName,azureADDeviceId,complianceState,lastSyncDateTime&$top=5`
  );
  if (matches.length === 0) throw new Error(`No managed device named "${deviceName}" was found.`);

  const device = matches[0];
  const warnings: string[] = [];
  if (matches.length > 1) warnings.push(`${matches.length} devices share this name; showing the first.`);

  let entraObjectId: string | null = null;
  let groups: { id: string; displayName: string }[] = [];

  if (device.azureADDeviceId) {
    try {
      const entra = await graphGet<GraphListResponse<{ id: string }>>(
        `/devices?$filter=deviceId eq '${esc(device.azureADDeviceId)}'&$select=id`
      );
      entraObjectId = entra.value?.[0]?.id ?? null;
      if (entraObjectId) groups = await deviceGroupIds(entraObjectId);
      else warnings.push("Device isn't registered in Entra ID, so device-group targeting can't be resolved.");
    } catch {
      warnings.push("Couldn't read this device's group membership from Entra ID.");
    }
  } else {
    warnings.push("Device has no Entra device ID; device-group targeting can't be resolved.");
  }

  return { device, entraObjectId, groups, warnings };
}

export interface ResolvedUser {
  user: DirectoryMember;
  groups: { id: string; displayName: string }[];
  warnings: string[];
}

export async function resolveUser(upnOrId: string): Promise<ResolvedUser> {
  const q = esc(upnOrId);
  let user: DirectoryMember;
  try {
    user = await graphGet<DirectoryMember>(
      `/users/${encodeURIComponent(q)}?$select=id,displayName,userPrincipalName,mail,jobTitle`
    );
  } catch {
    throw new Error(`No user found for "${upnOrId}".`);
  }
  const warnings: string[] = [];
  let groups: { id: string; displayName: string }[] = [];
  try {
    groups = await userGroupIds(user.id);
  } catch {
    warnings.push("Couldn't read this user's group membership.");
  }
  return { user, groups, warnings };
}

// ─── Effective-assignment resolution ─────────────────────────────────────────

export interface AppliedContext {
  groupIds: Set<string>;
  hasUser: boolean;
  hasDevice: boolean;
}

export interface AppliedPolicy {
  policyId: string;
  policyName: string;
  policyType: PolicyType;
  applies: boolean;
  includedVia: string[];
  excludedVia: string[];
  installIntent: string;
  filterName: string;
}

/**
 * Computes which policies apply to a principal, given the flattened assignment
 * records and the principal's group membership. Exclusions win over inclusions
 * (matching Intune's own precedence). Assignment filters are shown but not
 * evaluated — Graph doesn't expose runtime filter results.
 */
export function computeApplied(records: AssignmentRecord[], ctx: AppliedContext): AppliedPolicy[] {
  const matches = (r: AssignmentRecord): boolean => {
    if (r.targetKind === "allUsers") return ctx.hasUser;
    if (r.targetKind === "allDevices") return ctx.hasDevice;
    return r.groupId != null && ctx.groupIds.has(r.groupId);
  };

  const byPolicy = new Map<string, AssignmentRecord[]>();
  for (const r of records) {
    const arr = byPolicy.get(r.policyId) ?? [];
    arr.push(r);
    byPolicy.set(r.policyId, arr);
  }

  const result: AppliedPolicy[] = [];
  for (const [policyId, recs] of byPolicy) {
    const includes = recs.filter((r) => r.mode === "include" && matches(r));
    const excludes = recs.filter((r) => r.mode === "exclude" && matches(r));
    if (includes.length === 0 && excludes.length === 0) continue;

    const first = recs[0];
    const includedVia = includes.map((r) =>
      r.targetKind === "allUsers" ? "All Users" : r.targetKind === "allDevices" ? "All Devices" : r.groupName
    );
    const excludedVia = excludes.map((r) => r.groupName);
    const withIntent = includes.find((r) => r.installIntent) ?? includes[0];
    const withFilter = includes.find((r) => r.filterName) ?? includes[0];

    result.push({
      policyId,
      policyName: first.policyName,
      policyType: first.policyType,
      applies: includedVia.length > 0 && excludedVia.length === 0,
      includedVia: [...new Set(includedVia)],
      excludedVia: [...new Set(excludedVia)],
      installIntent: withIntent?.installIntent ?? "",
      filterName: withFilter?.filterName ?? "",
    });
  }

  return result.sort((a, b) =>
    a.policyType === b.policyType
      ? a.policyName.localeCompare(b.policyName)
      : a.policyType.localeCompare(b.policyType)
  );
}
