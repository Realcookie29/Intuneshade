// ─── IntuneShade Baseline — evaluators ────────────────────────────────────────
// Pure functions: snapshot in, verdict out. No Graph calls, no AI. Every verdict
// is reproducible from the snapshot, which is what makes the benchmark defensible.

import type { CaPolicy, Finding, IntunePolicy, TenantSnapshot } from "./types";

export type Verdict = Omit<Finding, "controlId">;
type Evaluator = (snap: TenantSnapshot, params: Record<string, unknown>) => Verdict;

// Well-known Entra IDs
export const ROLE_GLOBAL_ADMIN = "62e90394-69f5-4237-9190-012177145e10";
export const AUTH_STRENGTH_PHISHING_RESISTANT = "00000000-0000-0000-0000-000000000004";
const GUEST_ROLE_SAME_AS_MEMBER = "a0b1b346-4d3e-4e8b-98f8-753987be4970";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function data<T>(snap: TenantSnapshot, key: keyof TenantSnapshot): T {
  const src = snap[key];
  return (typeof src === "object" && src && "data" in src ? src.data : undefined) as T;
}

function endpoint(snap: TenantSnapshot, key: keyof TenantSnapshot): string | undefined {
  const src = snap[key];
  return typeof src === "object" && src && "endpoint" in src ? src.endpoint : undefined;
}

function requiresMfa(p: CaPolicy): boolean {
  return !!p.grantControls?.builtInControls?.includes("mfa") || !!p.grantControls?.authenticationStrength;
}

function blocks(p: CaPolicy): boolean {
  return !!p.grantControls?.builtInControls?.includes("block");
}

function allUsers(p: CaPolicy): boolean {
  return !!p.conditions?.users?.includeUsers?.includes("All");
}

function allApps(p: CaPolicy): boolean {
  return !!p.conditions?.applications?.includeApplications?.includes("All");
}

function includesGlobalAdmin(p: CaPolicy): boolean {
  return allUsers(p) || !!p.conditions?.users?.includeRoles?.includes(ROLE_GLOBAL_ADMIN);
}

function exclusionNote(p: CaPolicy): string {
  const u = p.conditions?.users;
  const n = (u?.excludeUsers?.length ?? 0) + (u?.excludeGroups?.length ?? 0);
  return n ? ` (${n} exclusion${n === 1 ? "" : "s"} — make sure these are break-glass accounts only)` : "";
}

/**
 * Finds CA policies matching `match`. Only enabled policies pass; a match that
 * is report-only is surfaced in the summary so admins see why it still fails.
 */
function caCheck(
  snap: TenantSnapshot,
  match: (p: CaPolicy) => boolean,
  passText: string,
  failText: string,
): Verdict {
  const policies = data<CaPolicy[]>(snap, "caPolicies") ?? [];
  const ep = endpoint(snap, "caPolicies");
  const enabled = policies.filter((p) => p.state === "enabled" && match(p));
  if (enabled.length) {
    return {
      status: "pass",
      summary: passText + exclusionNote(enabled[0]),
      evidence: { endpoint: ep, facts: enabled.map((p) => `Enforced by "${p.displayName}"`) },
    };
  }
  const reportOnly = policies.filter((p) => p.state === "enabledForReportingButNotEnforced" && match(p));
  return {
    status: "fail",
    summary: reportOnly.length ? `${failText} A matching policy exists but is report-only.` : failText,
    evidence: {
      endpoint: ep,
      facts: reportOnly.length
        ? reportOnly.map((p) => `Report-only: "${p.displayName}"`)
        : [`${policies.length} Conditional Access policies checked, none match`],
    },
  };
}

function securityDefaultsOn(snap: TenantSnapshot): boolean {
  return data<{ isEnabled?: boolean }>(snap, "securityDefaults")?.isEnabled === true;
}

function isAssigned(p: IntunePolicy): boolean {
  return p.isAssigned === true || (p.assignments?.length ?? 0) > 0;
}

function policyName(p: IntunePolicy): string {
  return p.name ?? p.displayName ?? p.id;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

// ─── Evaluators ───────────────────────────────────────────────────────────────

export const EVALUATORS: Record<string, Evaluator> = {
  /** MFA for all users via CA — or security defaults, which also enforce it. */
  caMfaAllUsers: (snap) => {
    if (securityDefaultsOn(snap)) {
      return {
        status: "pass",
        summary: "MFA is enforced through security defaults.",
        evidence: { endpoint: endpoint(snap, "securityDefaults"), facts: ["isEnabled: true"] },
      };
    }
    return caCheck(
      snap,
      (p) => allUsers(p) && allApps(p) && requiresMfa(p),
      "MFA is required for all users on all cloud apps.",
      "No enforced Conditional Access policy requires MFA for all users on all apps.",
    );
  },

  caMfaAdmins: (snap) => {
    if (securityDefaultsOn(snap)) {
      return {
        status: "pass",
        summary: "Admin MFA is enforced through security defaults.",
        evidence: { endpoint: endpoint(snap, "securityDefaults"), facts: ["isEnabled: true"] },
      };
    }
    return caCheck(
      snap,
      (p) => includesGlobalAdmin(p) && allApps(p) && requiresMfa(p),
      "MFA is required for Global Administrators.",
      "No enforced Conditional Access policy requires MFA for Global Administrators.",
    );
  },

  caPhishingResistantAdmins: (snap) =>
    caCheck(
      snap,
      (p) =>
        includesGlobalAdmin(p) &&
        p.grantControls?.authenticationStrength?.id === AUTH_STRENGTH_PHISHING_RESISTANT,
      "Global Administrators must use phishing-resistant MFA.",
      "No enforced policy requires phishing-resistant MFA (FIDO2 / Windows Hello / certificate) for admins.",
    ),

  caBlockLegacyAuth: (snap) => {
    if (securityDefaultsOn(snap)) {
      return {
        status: "pass",
        summary: "Legacy authentication is blocked by security defaults.",
        evidence: { endpoint: endpoint(snap, "securityDefaults"), facts: ["isEnabled: true"] },
      };
    }
    return caCheck(
      snap,
      (p) => {
        const types = p.conditions?.clientAppTypes ?? [];
        return allUsers(p) && blocks(p) && types.includes("exchangeActiveSync") && types.includes("other");
      },
      "Legacy authentication is blocked for all users.",
      "No enforced Conditional Access policy blocks legacy authentication.",
    );
  },

  caRiskPolicy: (snap, params) => {
    const kind = params.kind === "user" ? "user" : "signIn";
    return caCheck(
      snap,
      (p) => {
        const levels = kind === "user" ? p.conditions?.userRiskLevels : p.conditions?.signInRiskLevels;
        return allUsers(p) && !!levels?.length && (requiresMfa(p) || blocks(p) ||
          !!p.grantControls?.builtInControls?.includes("passwordChange"));
      },
      `A ${kind === "user" ? "user" : "sign-in"}-risk policy is enforced.`,
      `No enforced ${kind === "user" ? "user" : "sign-in"}-risk policy (requires Entra ID P2).`,
    );
  },

  caRequireCompliantDevice: (snap) =>
    caCheck(
      snap,
      (p) =>
        allUsers(p) &&
        !!(p.grantControls?.builtInControls?.includes("compliantDevice") ||
          p.grantControls?.builtInControls?.includes("domainJoinedDevice")),
      "Access requires a compliant or hybrid-joined device.",
      "No enforced policy requires a compliant device for access.",
    ),

  globalAdminCount: (snap, params) => {
    const min = Number(params.min ?? 2);
    const max = Number(params.max ?? 4);
    const admins = data<Array<{ displayName?: string; "@odata.type"?: string }>>(snap, "globalAdmins") ?? [];
    const n = admins.length;
    const ok = n >= min && n <= max;
    return {
      status: ok ? "pass" : "fail",
      summary: ok
        ? `${n} Global Administrators — within the recommended ${min}–${max}.`
        : n < min
          ? `Only ${n} Global Administrator${n === 1 ? "" : "s"} — add a second (break-glass) account.`
          : `${n} Global Administrators — reduce to at most ${max}; use least-privilege roles instead.`,
      evidence: { endpoint: endpoint(snap, "globalAdmins"), facts: [`count: ${n}`] },
    };
  },

  /** Generic field check on a snapshot source: eq / in / notIn / notContains. */
  field: (snap, params) => {
    const source = params.source as keyof TenantSnapshot;
    const path = String(params.path);
    const value = getPath(data<unknown>(snap, source), path);
    let ok: boolean;
    if ("eq" in params) ok = value === params.eq;
    else if ("in" in params) ok = (params.in as unknown[]).includes(value);
    else if ("notIn" in params) ok = !(params.notIn as unknown[]).includes(value);
    else if ("notContains" in params) ok = Array.isArray(value) && !value.includes(params.notContains);
    else ok = false;
    return {
      status: ok ? "pass" : "fail",
      summary: String(ok ? params.passText : params.failText),
      evidence: { endpoint: endpoint(snap, source), facts: [`${path}: ${JSON.stringify(value)}`] },
    };
  },

  guestAccessRestricted: (snap) => {
    const roleId = data<{ guestUserRoleId?: string }>(snap, "authorizationPolicy")?.guestUserRoleId;
    const ok = !!roleId && roleId !== GUEST_ROLE_SAME_AS_MEMBER;
    return {
      status: ok ? "pass" : "fail",
      summary: ok
        ? "Guest users have limited or restricted directory access."
        : "Guest users have the same directory access as members.",
      evidence: { endpoint: endpoint(snap, "authorizationPolicy"), facts: [`guestUserRoleId: ${roleId}`] },
    };
  },

  /** Beta exposes the assigned grant policies top-level; v1.0 nests them. Accept either. */
  userConsentRestricted: (snap) => {
    const policy = data<{
      permissionGrantPolicyIdsAssignedToDefaultUserRole?: string[];
      defaultUserRolePermissions?: { permissionGrantPoliciesAssigned?: string[] };
    }>(snap, "authorizationPolicy");
    const assigned =
      policy?.permissionGrantPolicyIdsAssignedToDefaultUserRole ??
      policy?.defaultUserRolePermissions?.permissionGrantPoliciesAssigned;
    if (!assigned) {
      return {
        status: "manual",
        summary: "Could not read the user consent setting — check Enterprise applications > Consent and permissions.",
        evidence: { endpoint: endpoint(snap, "authorizationPolicy"), facts: [] },
      };
    }
    const legacy = assigned.some((id) => id.endsWith("microsoft-user-default-legacy"));
    return {
      status: legacy ? "fail" : "pass",
      summary: legacy
        ? "Users can consent to any app for the permissions it asks for."
        : assigned.length
          ? "User consent is limited to verified publishers / low-risk permissions."
          : "User consent to apps is disabled.",
      evidence: { endpoint: endpoint(snap, "authorizationPolicy"), facts: [`grant policies: ${JSON.stringify(assigned)}`] },
    };
  },

  authMethodDisabled: (snap, params) => {
    const methodId = String(params.methodId);
    const policy = data<{ authenticationMethodConfigurations?: Array<{ id: string; state: string }> }>(
      snap, "authMethodsPolicy");
    const cfg = policy?.authenticationMethodConfigurations?.find((c) => c.id.toLowerCase() === methodId.toLowerCase());
    const state = cfg?.state ?? "unknown";
    return {
      status: state === "disabled" ? "pass" : "fail",
      summary: state === "disabled"
        ? `${methodId} is disabled as an authentication method.`
        : `${methodId} is still enabled as an authentication method.`,
      evidence: { endpoint: endpoint(snap, "authMethodsPolicy"), facts: [`${methodId}.state: ${state}`] },
    };
  },

  /**
   * Endpoint-security style check: an assigned Settings Catalog / endpoint
   * security policy of one of `families`. Legacy device configurations of
   * `legacyTypes` count as "manual" — they may cover it, but we can't tell
   * from the type alone.
   */
  intuneFamilyAssigned: (snap, params) => {
    const families = (params.families as string[]) ?? [];
    const legacyTypes = (params.legacyTypes as string[]) ?? [];
    const label = String(params.label ?? "policy");
    const config = data<IntunePolicy[]>(snap, "configurationPolicies") ?? [];
    const matches = config.filter((p) => families.includes(p.templateReference?.templateFamily ?? ""));
    const assigned = matches.filter(isAssigned);
    if (assigned.length) {
      return {
        status: "pass",
        summary: `${assigned.length} assigned ${label} polic${assigned.length === 1 ? "y" : "ies"}.`,
        evidence: { endpoint: endpoint(snap, "configurationPolicies"), facts: assigned.map((p) => `Assigned: "${policyName(p)}"`) },
      };
    }
    const legacy = (data<IntunePolicy[]>(snap, "deviceConfigurations") ?? [])
      .filter((p) => legacyTypes.includes(p["@odata.type"] ?? "") && isAssigned(p));
    if (legacy.length) {
      return {
        status: "manual",
        summary: `No endpoint security ${label} policy, but ${legacy.length} assigned legacy profile(s) may cover it — verify.`,
        evidence: { endpoint: endpoint(snap, "deviceConfigurations"), facts: legacy.map((p) => `Legacy: "${policyName(p)}"`) },
      };
    }
    const baselines = config.filter((p) => p.templateReference?.templateFamily === "baseline" && isAssigned(p));
    if (baselines.length) {
      return {
        status: "manual",
        summary: `No endpoint security ${label} policy, but an assigned security baseline may cover it — verify.`,
        evidence: { endpoint: endpoint(snap, "configurationPolicies"), facts: baselines.map((p) => `Baseline: "${policyName(p)}"`) },
      };
    }
    return {
      status: "fail",
      summary: (matches.length
        ? `${matches.length} ${label} polic${matches.length === 1 ? "y exists" : "ies exist"} but none are assigned.`
        : `No ${label} policy found.`) + " Generic Settings Catalog profiles are not inspected yet.",
      evidence: { endpoint: endpoint(snap, "configurationPolicies"), facts: matches.map((p) => `Unassigned: "${policyName(p)}"`) },
    };
  },

  /** An assigned object of `odataType` in a source (compliance policies, update rings, …). */
  odataTypeAssigned: (snap, params) => {
    const source = params.source as keyof TenantSnapshot;
    const types = (params.odataTypes as string[]) ?? [];
    const label = String(params.label ?? "policy");
    const all = (data<IntunePolicy[]>(snap, source) ?? []).filter((p) => types.includes(p["@odata.type"] ?? ""));
    const assigned = all.filter(isAssigned);
    return {
      status: assigned.length ? "pass" : "fail",
      summary: assigned.length
        ? `${assigned.length} assigned ${label}${assigned.length === 1 ? "" : "s"}.`
        : all.length
          ? `${all.length} ${label}${all.length === 1 ? "" : "s"} found, none assigned.`
          : `No ${label} found.`,
      evidence: { endpoint: endpoint(snap, source), facts: (assigned.length ? assigned : all).map((p) => `"${policyName(p)}"`) },
    };
  },

  nonCompliantRatio: (snap, params) => {
    const max = Number(params.maxPercent ?? 10);
    const s = data<{ compliantDeviceCount?: number; nonCompliantDeviceCount?: number; errorDeviceCount?: number; conflictDeviceCount?: number }>(
      snap, "complianceSummary");
    const bad = (s?.nonCompliantDeviceCount ?? 0) + (s?.errorDeviceCount ?? 0) + (s?.conflictDeviceCount ?? 0);
    const total = bad + (s?.compliantDeviceCount ?? 0);
    if (!total) {
      return { status: "not_applicable", summary: "No devices report compliance state.", evidence: { endpoint: endpoint(snap, "complianceSummary"), facts: [] } };
    }
    const pct = Math.round((bad / total) * 1000) / 10;
    return {
      status: pct <= max ? "pass" : "fail",
      summary: `${pct}% of devices are non-compliant, in error or in conflict (threshold ${max}%).`,
      evidence: { endpoint: endpoint(snap, "complianceSummary"), facts: [`compliant: ${total - bad}`, `not compliant: ${bad}`] },
    };
  },
};
