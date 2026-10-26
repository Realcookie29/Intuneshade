// ─── Directory settings: users, groups, devices, apps, guests, hybrid ─────────

import type { CheckContext } from "../context";
import { fetchFailure, isoDays, prop, result, single } from "../context";
import type { CheckResult } from "../types";

type Check = (ctx: CheckContext, id: string, expected: string) => Promise<CheckResult>;

export const AUTHZ = "/v1.0/policies/authorizationPolicy";
export const DEVICE_REG = "/beta/policies/deviceRegistrationPolicy";
const APP_MGMT = "/v1.0/policies/defaultAppManagementPolicy";
const ADMIN_CONSENT = "/v1.0/policies/adminConsentRequestPolicy";
export const ORGANIZATION = "/v1.0/organization?$select=id,onPremisesSyncEnabled";
const ONPREM_SYNC = "/v1.0/directory/onPremisesSynchronization";

const GUEST_LIMITED = "10dae51f-b6af-4016-8d66-8c2a99b929b3";
const GUEST_RESTRICTED = "2af84b1e-32c8-42b7-82bc-daa82404023b";

/** Single property compared to an expected value. */
function equals(path: string, source: string, want: unknown, opts: { beta?: boolean; role?: string } = {}): Check {
  return async (ctx, id, expected) => {
    const r = await ctx.get<unknown>(source);
    // Some endpoints accept no Graph scope at all, only a directory role: a 403 then
    // says nothing about the setting, so hand it back to the admin instead of erroring.
    if (!r.ok && r.status === 403 && opts.role) {
      return result(id, expected, "Manual", "unknown", `Only a ${opts.role} can read this setting through Graph. Verify it in the portal, or rerun signed in with that role.`,
        [{ source, path: "", value: "HTTP 403" }]);
    }
    if (!r.ok) return fetchFailure(id, expected, r, opts.beta);
    const raw = prop(single(r.data), path);
    // Beta sometimes serialises booleans as strings ("false").
    const value = raw === "true" ? true : raw === "false" ? false : raw;
    return result(id, expected, value === want ? "Pass" : "Fail", JSON.stringify(value),
      value === want ? `${path} is ${JSON.stringify(want)}.` : `${path} is ${JSON.stringify(value)}, expected ${JSON.stringify(want)}.`,
      [{ source, path, value }]);
  };
}

const deviceQuota: Check = async (ctx, id, expected) => {
  const r = await ctx.get<unknown>(DEVICE_REG);
  if (!r.ok) return fetchFailure(id, expected, r, true);
  const q = Number(prop(r.data, "userDeviceQuota"));
  return result(id, expected, q <= 20 ? "Pass" : "Fail", String(q),
    q <= 20 ? `Users can join or register up to ${q} devices.` : `Users can join or register up to ${q} devices; set 20 or fewer.`,
    [{ source: DEVICE_REG, path: "userDeviceQuota", value: q }]);
};

const registeringUsersAdmin: Check = async (ctx, id, expected) => {
  const r = await ctx.get<unknown>(DEVICE_REG);
  if (!r.ok) return fetchFailure(id, expected, r, true);
  const ru = prop(r.data, "azureADJoin.localAdmins.registeringUsers") as { "@odata.type"?: string; users?: string[]; groups?: string[] } | undefined;
  const type = ru?.["@odata.type"] ?? "unknown";
  const ev = [{ source: DEVICE_REG, path: "azureADJoin.localAdmins.registeringUsers.@odata.type", value: type }];
  if (type === "#microsoft.graph.noDeviceRegistrationMembership") {
    return result(id, expected, "Pass", "None", "Users who join devices do not become local administrators.", ev);
  }
  if (type === "#microsoft.graph.enumeratedDeviceRegistrationMembership") {
    const n = (ru?.users?.length ?? 0) + (ru?.groups?.length ?? 0);
    return result(id, expected, "Pass", `Selected (${n})`, `Only ${n} selected user(s)/group(s) become local administrators — keep this group small.`, ev);
  }
  return result(id, expected, type.includes("allDeviceRegistrationMembership") ? "Fail" : "Manual", type,
    type.includes("allDeviceRegistrationMembership") ? "All users who join a device become local administrator." : "Unrecognised setting — verify in the portal.", ev);
};

/** Lifetime restriction on app credentials ≤ 180 days. */
function credentialLifetime(collection: "passwordCredentials" | "keyCredentials", restrictionType: string): Check {
  return async (ctx, id, expected) => {
    const r = await ctx.get<{ isEnabled?: boolean; applicationRestrictions?: Record<string, Array<{ restrictionType: string; maxLifetime?: string; state?: string }>> }>(APP_MGMT);
    if (!r.ok) return fetchFailure(id, expected, r);
    const rule = r.data.applicationRestrictions?.[collection]?.find((x) => x.restrictionType === restrictionType && x.state !== "disabled");
    const days = isoDays(rule?.maxLifetime);
    const ev = [
      { source: APP_MGMT, path: "isEnabled", value: r.data.isEnabled ?? false },
      { source: APP_MGMT, path: `applicationRestrictions.${collection}[${restrictionType}].maxLifetime`, value: rule?.maxLifetime ?? null },
    ];
    if (!r.data.isEnabled) return result(id, expected, "Fail", "policy disabled", "The default app management policy is not enabled.", ev);
    if (!rule) return result(id, expected, "Fail", "no restriction", `No ${restrictionType} restriction is configured.`, ev);
    return result(id, expected, days <= 180 ? "Pass" : "Fail", rule.maxLifetime ?? "—",
      days <= 180 ? `Maximum lifetime is ${rule.maxLifetime}.` : `Maximum lifetime is ${rule.maxLifetime}; set P180D or less.`, ev);
  };
}

const passwordLifetime: Check = async (ctx, id, expected) => {
  const base = await credentialLifetime("passwordCredentials", "passwordLifetime")(ctx, id, expected);
  // Informational: existing app secrets older than 180 days.
  const apps = await ctx.getAll<{ displayName: string; passwordCredentials?: Array<{ startDateTime?: string; endDateTime?: string }> }>(
    "/v1.0/applications?$select=displayName,passwordCredentials");
  if (!apps.ok) return base;
  const cutoff = Date.now() - 180 * 86400_000;
  const old = apps.data.filter((a) => a.passwordCredentials?.some((c) => c.startDateTime && Date.parse(c.startDateTime) < cutoff && (!c.endDateTime || Date.parse(c.endDateTime) > Date.now())));
  if (!old.length) return base;
  return {
    ...base,
    message: `${base.message} Info: ${old.length} app(s) have an active secret older than 180 days.`,
    table: { name: "apps-with-old-secrets", columns: ["Application"], rows: old.map((a) => [a.displayName]) },
  };
};

const customPasswords: Check = async (ctx, id, expected) => {
  const r = await ctx.get<{ isEnabled?: boolean; applicationRestrictions?: { passwordCredentials?: Array<{ restrictionType: string; state?: string }> } }>(APP_MGMT);
  if (!r.ok) return fetchFailure(id, expected, r);
  const rule = r.data.applicationRestrictions?.passwordCredentials?.find((x) => x.restrictionType === "customPasswordAddition" && x.state !== "disabled");
  const ok = !!r.data.isEnabled && !!rule;
  return result(id, expected, ok ? "Pass" : "Fail", ok ? "blocked" : "allowed",
    ok ? "Custom (user-chosen) app passwords are blocked." : !r.data.isEnabled ? "The default app management policy is not enabled." : "No customPasswordAddition restriction is configured.",
    [{ source: APP_MGMT, path: "applicationRestrictions.passwordCredentials[customPasswordAddition]", value: rule ?? null }]);
};

const adminConsent: Check = async (ctx, id, expected) => {
  const r = await ctx.get<{ isEnabled?: boolean; reviewers?: unknown[] }>(ADMIN_CONSENT);
  if (!r.ok) return fetchFailure(id, expected, r);
  const n = r.data.reviewers?.length ?? 0;
  const ok = !!r.data.isEnabled && n >= 1;
  return result(id, expected, ok ? "Pass" : "Fail", `${r.data.isEnabled ? "enabled" : "disabled"}, ${n} reviewer(s)`,
    ok ? `Admin consent requests are enabled with ${n} reviewer(s).` : !r.data.isEnabled ? "The admin consent workflow is disabled." : "The admin consent workflow has no reviewers.",
    [{ source: ADMIN_CONSENT, path: "isEnabled", value: r.data.isEnabled ?? false }, { source: ADMIN_CONSENT, path: "reviewers.length", value: n }]);
};

const guestRole: Check = async (ctx, id, expected) => {
  const r = await ctx.get<unknown>(AUTHZ);
  if (!r.ok) return fetchFailure(id, expected, r);
  const roleId = prop(single(r.data), "guestUserRoleId");
  const ok = roleId === GUEST_LIMITED || roleId === GUEST_RESTRICTED;
  return result(id, expected, ok ? "Pass" : "Fail", roleId === GUEST_RESTRICTED ? "most restrictive" : roleId === GUEST_LIMITED ? "limited" : "same as members",
    ok ? "Guest directory access is restricted." : "Guests have the same directory access as members.",
    [{ source: AUTHZ, path: "guestUserRoleId", value: roleId }]);
};

/** Is the tenant synchronising from on-premises? null when unknown. */
export async function isHybrid(ctx: CheckContext): Promise<boolean | null> {
  const org = await ctx.getAll<{ onPremisesSyncEnabled?: boolean | null }>(ORGANIZATION);
  return org.ok ? org.data[0]?.onPremisesSyncEnabled === true : null;
}

const passwordHashSync: Check = async (ctx, id, expected) => {
  const hybrid = await isHybrid(ctx);
  if (hybrid === false) {
    return result(id, expected, "NotApplicable", "cloud-only", "The tenant does not synchronise from on-premises.",
      [{ source: ORGANIZATION, path: "onPremisesSyncEnabled", value: false }]);
  }
  const sync = await ctx.getAll<{ features?: { passwordSyncEnabled?: boolean } }>(ONPREM_SYNC);
  if (!sync.ok) return fetchFailure(id, expected, sync);
  const phs = sync.data[0]?.features?.passwordSyncEnabled === true;
  const domains = await ctx.getAll<{ id: string; authenticationType?: string }>("/v1.0/domains?$select=id,authenticationType");
  const federated = domains.ok ? domains.data.filter((d) => d.authenticationType === "Federated").map((d) => d.id) : [];
  return result(id, expected, phs ? "Pass" : "Fail", phs ? "enabled" : "disabled",
    (phs ? "Password hash sync is enabled." : "Password hash sync is disabled.") + (federated.length ? ` Federated domains: ${federated.join(", ")} — keep PHS as a fallback.` : ""),
    [{ source: ONPREM_SYNC, path: "features.passwordSyncEnabled", value: phs }]);
};

export const DIRECTORY_CHECKS: Record<string, Check> = {
  "5.1.2.2": equals("defaultUserRolePermissions.allowedToCreateApps", AUTHZ, false),
  "5.1.2.3": equals("defaultUserRolePermissions.allowedToCreateTenants", AUTHZ, false),
  "5.1.2.4": equals("restrictNonAdminAccess", "/beta/admin/entra/uxSetting", true, { beta: true, role: "Global Administrator" }),
  "5.1.3.1": equals("defaultUserRolePermissions.allowedToCreateSecurityGroups", AUTHZ, false),
  "5.1.4.2": deviceQuota,
  "5.1.4.3": equals("azureADJoin.localAdmins.enableGlobalAdmins", DEVICE_REG, false, { beta: true }),
  "5.1.4.4": registeringUsersAdmin,
  "5.1.4.5": equals("localAdminPassword.isEnabled", DEVICE_REG, true, { beta: true }),
  "5.1.5.2": adminConsent,
  "5.1.5.4": passwordLifetime,
  "5.1.5.5": customPasswords,
  "5.1.5.6": credentialLifetime("keyCredentials", "asymmetricKeyLifetime"),
  "5.1.6.2": guestRole,
  "5.1.8.1": passwordHashSync,
};
