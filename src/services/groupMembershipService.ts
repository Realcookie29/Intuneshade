import { graphGet, graphGetAll, graphPost, graphDelete } from "./graphClient";
import type { DirectoryMember, GroupDetail } from "../types/graphTypes";

const GRAPH_BETA = "https://graph.microsoft.com/beta";

/** Full detail for a single group, including dynamic membership rule. */
export async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  return graphGet<GroupDetail>(
    `/groups/${groupId}?$select=id,displayName,description,groupTypes,membershipRule,mailNickname,securityEnabled`
  );
}

/** True if the group's membership is managed by a dynamic rule (not editable by hand). */
export function isDynamicGroup(group: GroupDetail): boolean {
  return (group.groupTypes ?? []).includes("DynamicMembership");
}

export async function fetchMembers(groupId: string): Promise<DirectoryMember[]> {
  return graphGetAll<DirectoryMember>(
    `/groups/${groupId}/members?$select=id,displayName,userPrincipalName,deviceId,mail,jobTitle&$top=999`
  );
}

/** Searches users and devices by name/UPN to add as members. */
export async function searchDirectoryObjects(query: string): Promise<DirectoryMember[]> {
  const q = query.trim().replace(/'/g, "''");
  if (!q) return [];

  const [users, devices] = await Promise.all([
    graphGetAll<DirectoryMember>(
      `/users?$select=id,displayName,userPrincipalName,mail,jobTitle` +
        `&$filter=startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}')&$top=25`
    ).catch(() => [] as DirectoryMember[]),
    graphGetAll<DirectoryMember>(
      `/devices?$select=id,displayName,deviceId` +
        `&$filter=startswith(displayName,'${q}')&$top=25`
    ).catch(() => [] as DirectoryMember[]),
  ]);

  return [...users, ...devices];
}

export async function addMember(groupId: string, objectId: string): Promise<void> {
  await graphPost(`/groups/${groupId}/members/$ref`, {
    "@odata.id": `${GRAPH_BETA}/directoryObjects/${objectId}`,
  });
}

export async function removeMember(groupId: string, memberId: string): Promise<void> {
  await graphDelete(`/groups/${groupId}/members/${memberId}/$ref`);
}

/** Classifies a directory member as a user or device for display. */
export function memberKind(m: DirectoryMember): "user" | "device" | "group" | "other" {
  const t = m["@odata.type"] ?? "";
  if (t.includes("user")) return "user";
  if (t.includes("device")) return "device";
  if (t.includes("group")) return "group";
  // Fall back on shape when @odata.type is absent
  if (m.userPrincipalName) return "user";
  if (m.deviceId) return "device";
  return "other";
}
