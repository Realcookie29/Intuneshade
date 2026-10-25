// ─── Privileged identities ────────────────────────────────────────────────────
// Active and eligible assignments to privileged roles, with group assignments
// expanded to their transitive user members. Shared by several checks and
// memoised per run.

import type { CheckContext } from "../context";
import { mapLimit } from "../context";

export const ROLE_GLOBAL_ADMIN = "62e90394-69f5-4237-9190-012177145e10";
export const ROLE_PRIVILEGED_ROLE_ADMIN = "e8611ab8-c189-46e8-94e1-60213ab1f814";

export interface RoleDef { id: string; displayName: string; templateId?: string }

interface Principal {
  "@odata.type"?: string;
  id: string;
  displayName?: string;
  userPrincipalName?: string;
}

interface Assignment {
  principalId: string;
  roleDefinitionId: string;
  principal?: Principal;
}

export interface PrivUser {
  id: string;
  userPrincipalName: string;
  displayName: string;
  /** Role definition ids held (active or eligible). */
  roles: Set<string>;
  active: boolean;
  eligible: boolean;
  /** True when (some) access comes through a group. */
  viaGroup: boolean;
}

export interface Privileged {
  roles: RoleDef[];
  users: Map<string, PrivUser>;
  /** Informational notes, e.g. "eligibility not readable (no Entra ID P2)". */
  notes: string[];
  /** Hard failure reading the role definitions or active assignments. */
  error?: { status: number; error: string; path: string };
  sources: string[];
}

const ROLE_DEFS_V1 = "/v1.0/roleManagement/directory/roleDefinitions?$filter=isPrivileged eq true";
const ROLE_DEFS_BETA = "/beta/roleManagement/directory/roleDefinitions?$filter=isPrivileged eq true";
export const ASSIGNMENTS = "/v1.0/roleManagement/directory/roleAssignments?$expand=principal";
export const ELIGIBILITY = "/v1.0/roleManagement/directory/roleEligibilitySchedules?$expand=principal";

/** Privileged role definitions — v1.0 first, beta as fallback where the filter is not supported. */
export async function privilegedRoles(ctx: CheckContext) {
  const v1 = await ctx.getAll<RoleDef>(ROLE_DEFS_V1);
  if (v1.ok || v1.status !== 400) return v1;
  return ctx.getAll<RoleDef>(ROLE_DEFS_BETA);
}

const isUser = (p?: Principal) => p?.["@odata.type"] === "#microsoft.graph.user";
const isGroup = (p?: Principal) => p?.["@odata.type"] === "#microsoft.graph.group";

export function groupMembersPath(groupId: string) {
  return `/v1.0/groups/${groupId}/transitiveMembers/microsoft.graph.user?$select=id,displayName,userPrincipalName`;
}

export function getPrivileged(ctx: CheckContext): Promise<Privileged> {
  return ctx.memo("privileged", async () => {
    const out: Privileged = { roles: [], users: new Map(), notes: [], sources: [] };
    const roles = await privilegedRoles(ctx);
    if (!roles.ok) return { ...out, error: roles };
    out.roles = roles.data;
    out.sources.push(roles.path);
    const roleIds = new Set(roles.data.map((r) => r.id));

    const active = await ctx.getAll<Assignment>(ASSIGNMENTS);
    if (!active.ok) return { ...out, error: active };
    out.sources.push(active.path);
    const eligible = await ctx.getAll<Assignment>(ELIGIBILITY);
    if (eligible.ok) out.sources.push(eligible.path);
    else out.notes.push(`Eligible assignments not readable (${eligible.error}) — PIM may not be licensed; only active assignments counted.`);

    const groupsToExpand = new Map<string, { roles: Set<string>; active: boolean; eligible: boolean }>();
    const add = (p: Principal, roleId: string, kind: "active" | "eligible", viaGroup: boolean) => {
      const u = out.users.get(p.id) ?? {
        id: p.id,
        userPrincipalName: p.userPrincipalName ?? "",
        displayName: p.displayName ?? p.id,
        roles: new Set<string>(),
        active: false,
        eligible: false,
        viaGroup: false,
      };
      u.roles.add(roleId);
      if (kind === "active") u.active = true;
      else u.eligible = true;
      u.viaGroup ||= viaGroup;
      out.users.set(p.id, u);
    };

    const all: Array<[Assignment, "active" | "eligible"]> = [
      ...active.data.map((a) => [a, "active"] as [Assignment, "active"]),
      ...(eligible.ok ? eligible.data.map((a) => [a, "eligible"] as [Assignment, "eligible"]) : []),
    ];
    for (const [a, kind] of all) {
      if (!roleIds.has(a.roleDefinitionId) || !a.principal) continue;
      if (isUser(a.principal)) add(a.principal, a.roleDefinitionId, kind, false);
      else if (isGroup(a.principal)) {
        const g = groupsToExpand.get(a.principal.id) ?? { roles: new Set<string>(), active: false, eligible: false };
        g.roles.add(a.roleDefinitionId);
        if (kind === "active") g.active = true;
        else g.eligible = true;
        groupsToExpand.set(a.principal.id, g);
      }
      // Service principals are out of scope for these user-focused checks.
    }

    await mapLimit([...groupsToExpand.entries()], 4, async ([groupId, g]) => {
      const members = await ctx.getAll<Principal>(groupMembersPath(groupId));
      if (!members.ok) {
        out.notes.push(`Members of role-assignable group ${groupId} not readable (${members.error}).`);
        return;
      }
      for (const m of members.data) {
        for (const r of g.roles) {
          if (g.active) add({ ...m, "@odata.type": "#microsoft.graph.user" }, r, "active", true);
          if (g.eligible) add({ ...m, "@odata.type": "#microsoft.graph.user" }, r, "eligible", true);
        }
      }
    });
    return out;
  });
}

export interface UserDetails {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  onPremisesSyncEnabled?: boolean | null;
  accountEnabled?: boolean;
}

export function userPath(id: string) {
  return `/v1.0/users/${id}?$select=id,displayName,userPrincipalName,onPremisesSyncEnabled,accountEnabled`;
}

export const label = (u: { userPrincipalName?: string; displayName?: string; id: string }) =>
  u.userPrincipalName || u.displayName || u.id;
