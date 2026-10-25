// ─── Conditional Access engine + 5.2.2.x checks ───────────────────────────────

import type { CheckContext } from "../context";
import { fetchFailure, mapLimit, result } from "../context";
import type { CheckResult, CheckState, Evidence } from "../types";
import { ROLE_GLOBAL_ADMIN, getPrivileged, groupMembersPath, label } from "./roles";

export const CA_POLICIES = "/v1.0/identity/conditionalAccess/policies";
export const SUBSCRIBED_SKUS = "/v1.0/subscribedSkus?$select=skuPartNumber,capabilityStatus,servicePlans";
const INTUNE_ENROLLMENT_APP = "d4ebce55-015a-49b5-a083-c84d1797ae8c";

export interface CaPolicy {
  id: string;
  displayName: string;
  state: "enabled" | "disabled" | "enabledForReportingButNotEnforced";
  conditions?: {
    users?: {
      includeUsers?: string[]; excludeUsers?: string[];
      includeGroups?: string[]; excludeGroups?: string[];
      includeRoles?: string[]; excludeRoles?: string[];
      includeGuestsOrExternalUsers?: unknown; excludeGuestsOrExternalUsers?: unknown;
    };
    applications?: {
      includeApplications?: string[]; excludeApplications?: string[];
      includeUserActions?: string[]; includeAuthenticationContextClassReferences?: string[];
    };
    clientAppTypes?: string[];
    platforms?: { includePlatforms?: string[]; excludePlatforms?: string[] } | null;
    locations?: { includeLocations?: string[]; excludeLocations?: string[] } | null;
    devices?: { deviceFilter?: unknown } | null;
    signInRiskLevels?: string[];
    userRiskLevels?: string[];
    authenticationFlows?: { transferMethods?: string } | null;
  };
  grantControls?: {
    operator?: "AND" | "OR";
    builtInControls?: string[];
    authenticationStrength?: { id: string; displayName?: string } | null;
  } | null;
  sessionControls?: {
    signInFrequency?: { isEnabled?: boolean; value?: number | null; type?: "hours" | "days" | null; frequencyInterval?: string } | null;
    persistentBrowser?: { isEnabled?: boolean; mode?: string } | null;
  } | null;
}

// ─── Policy predicates ────────────────────────────────────────────────────────

const has = (arr: string[] | undefined, v: string) => !!arr?.some((x) => x.toLowerCase() === v.toLowerCase());
export const grantMfa = (p: CaPolicy) => has(p.grantControls?.builtInControls, "mfa") || !!p.grantControls?.authenticationStrength;
export const grantBlock = (p: CaPolicy) => has(p.grantControls?.builtInControls, "block");
export const grantManagedDevice = (p: CaPolicy) =>
  has(p.grantControls?.builtInControls, "compliantDevice") || has(p.grantControls?.builtInControls, "domainJoinedDevice");
export const allUsers = (p: CaPolicy) => has(p.conditions?.users?.includeUsers, "All");
export const allApps = (p: CaPolicy) => has(p.conditions?.applications?.includeApplications, "All");
const transferMethods = (p: CaPolicy) => (p.conditions?.authenticationFlows?.transferMethods ?? "").split(",").map((s) => s.trim());

/** A policy with users but no target resources does nothing. */
export function targetsResources(p: CaPolicy): boolean {
  const a = p.conditions?.applications;
  return !!(a?.includeApplications?.length || a?.includeUserActions?.length || a?.includeAuthenticationContextClassReferences?.length);
}

type Condition = "clientAppTypes" | "platforms" | "locations" | "devices";

function carveOuts(p: CaPolicy, allowed: Condition[]): string[] {
  const c = p.conditions ?? {};
  const out: string[] = [];
  const types = c.clientAppTypes ?? [];
  if (!allowed.includes("clientAppTypes") && types.length && !has(types, "all")) out.push(`client apps limited to ${types.join(", ")}`);
  const plat = c.platforms;
  if (!allowed.includes("platforms") && plat && ((plat.includePlatforms?.length && !has(plat.includePlatforms, "all")) || plat.excludePlatforms?.length)) {
    out.push(`platforms: include ${plat.includePlatforms?.join(", ") || "—"}${plat.excludePlatforms?.length ? `, exclude ${plat.excludePlatforms.join(", ")}` : ""}`);
  }
  const loc = c.locations;
  if (!allowed.includes("locations") && loc && ((loc.includeLocations?.length && !has(loc.includeLocations, "All")) || loc.excludeLocations?.length)) {
    out.push("location conditions narrow the scope");
  }
  if (!allowed.includes("devices") && c.devices?.deviceFilter) out.push("device filter narrows the scope");
  return out;
}

/** Exclusions beyond the tagged break-glass accounts. */
function extraExclusions(p: CaPolicy, breakGlass: Set<string>): string[] {
  const u = p.conditions?.users ?? {};
  const out: string[] = [];
  const users = (u.excludeUsers ?? []).filter((id) => !breakGlass.has(id));
  if (users.length) out.push(`${users.length} excluded user(s) not tagged as break-glass`);
  if (u.excludeGroups?.length) out.push(`${u.excludeGroups.length} excluded group(s)`);
  if (u.excludeRoles?.length) out.push(`${u.excludeRoles.length} excluded role(s)`);
  if (u.excludeGuestsOrExternalUsers) out.push("guests / external users excluded");
  return out;
}

export type Scope = "allUsers" | "admins" | "any";

export interface CaSpec {
  /** The requirement that makes a policy relevant (grant, condition, session control). */
  core: (p: CaPolicy) => boolean;
  scope: Scope;
  requireAllApps: boolean;
  allowed?: Condition[];
  /** Short description of what was looked for, used in Fail messages. */
  lookingFor: string;
}

interface Assessed { policy: CaPolicy; issues: string[] }

function assess(p: CaPolicy, spec: CaSpec, breakGlass: Set<string>): Assessed {
  const issues: string[] = [];
  if (p.state === "enabledForReportingButNotEnforced") issues.push("report-only");
  const u = p.conditions?.users ?? {};
  if (spec.scope === "allUsers" && !allUsers(p)) {
    const scoped = [
      u.includeGroups?.length ? `${u.includeGroups.length} group(s)` : "",
      u.includeRoles?.length ? `${u.includeRoles.length} role(s)` : "",
      u.includeUsers?.length ? `${u.includeUsers.length} user(s)` : "",
    ].filter(Boolean).join(", ");
    issues.push(`scoped to ${scoped || "a subset of users"} instead of All users`);
  }
  if (spec.scope === "admins" && !allUsers(p) && !has(u.includeRoles, ROLE_GLOBAL_ADMIN)) {
    issues.push("does not include the Global Administrator role");
  }
  if (spec.requireAllApps && !allApps(p)) issues.push("not targeting All resources");
  issues.push(...extraExclusions(p, breakGlass));
  issues.push(...carveOuts(p, spec.allowed ?? []));
  return { policy: p, issues };
}

export interface CaOutcome { state: CheckState; message: string; evidence: Evidence[]; passedBy: string[] }

export function evaluateCa(policies: CaPolicy[], spec: CaSpec, breakGlass: Set<string>): CaOutcome {
  const relevant = policies.filter((p) => p.state !== "disabled" && spec.core(p));
  const ineffective = relevant.filter((p) => !targetsResources(p));
  const candidates = relevant.filter(targetsResources).map((p) => assess(p, spec, breakGlass));
  const evidence: Evidence[] = candidates.map((c) => ({
    source: CA_POLICIES,
    path: `policies["${c.policy.displayName}"]`,
    value: { state: c.policy.state, issues: c.issues.length ? c.issues : "none" },
  }));
  const ineffectiveNote = ineffective.length
    ? ` Ineffective (no target resources): ${ineffective.map((p) => `"${p.displayName}"`).join(", ")}.`
    : "";

  const clean = candidates.filter((c) => c.issues.length === 0);
  if (clean.length) {
    return {
      state: "Pass",
      message: `Enforced by ${clean.map((c) => `"${c.policy.displayName}"`).join(", ")}.${ineffectiveNote}`,
      evidence,
      passedBy: clean.map((c) => c.policy.displayName),
    };
  }
  if (candidates.length) {
    const best = [...candidates].sort((a, b) => a.issues.length - b.issues.length)[0];
    return {
      state: "Partial",
      message: `Closest match "${best.policy.displayName}": ${best.issues.join("; ")}.${ineffectiveNote}`,
      evidence,
      passedBy: [],
    };
  }
  return {
    state: "Fail",
    message: `No enabled policy ${spec.lookingFor}.${ineffectiveNote}`,
    evidence: [{ source: CA_POLICIES, path: "value.length", value: policies.length }],
    passedBy: [],
  };
}

// ─── Licensing ────────────────────────────────────────────────────────────────

/** true / false, or null when the licence list could not be read. */
export async function hasEntraP2(ctx: CheckContext): Promise<boolean | null> {
  const skus = await ctx.getAll<{ capabilityStatus?: string; servicePlans?: Array<{ servicePlanName: string }> }>(SUBSCRIBED_SKUS);
  if (!skus.ok) return null;
  return skus.data.some((s) => s.capabilityStatus === "Enabled" && s.servicePlans?.some((p) => p.servicePlanName === "AAD_PREMIUM_P2"));
}

// ─── Checks ───────────────────────────────────────────────────────────────────

type Check = (ctx: CheckContext, id: string, expected: string) => Promise<CheckResult>;

function caCheck(spec: CaSpec, opts: { needsP2?: boolean } = {}): Check {
  return async (ctx, id, expected) => {
    const pol = await ctx.getAll<CaPolicy>(CA_POLICIES);
    if (!pol.ok) return fetchFailure(id, expected, pol);
    const bg = new Set(ctx.options.breakGlass.map((b) => b.id));
    const o = evaluateCa(pol.data, spec, bg);
    if (opts.needsP2 && o.state === "Fail" && (await hasEntraP2(ctx)) === false) {
      return result(id, expected, "NotApplicable", "no Entra ID P2", "Requires Entra ID P2 (ID Protection); no P2 licence found.",
        [{ source: SUBSCRIBED_SKUS, path: "servicePlans[AAD_PREMIUM_P2]", value: "absent" }]);
    }
    const actual = o.state === "Pass" ? `${o.passedBy.length} matching enforced policy` : o.state === "Partial" ? "partially covered" : "no matching policy";
    return result(id, expected, o.state, actual, o.message, o.evidence);
  };
}

function worst(a: CheckState, b: CheckState): CheckState {
  const rank: CheckState[] = ["Error", "Fail", "Partial", "Manual", "NotApplicable", "Pass"];
  return rank.indexOf(a) <= rank.indexOf(b) ? a : b;
}

/** 5.2.2.1 — every privileged role covered by an enforced MFA policy (or users covered through groups). */
const privilegedMfa: Check = async (ctx, id, expected) => {
  const pol = await ctx.getAll<CaPolicy>(CA_POLICIES);
  if (!pol.ok) return fetchFailure(id, expected, pol);
  const priv = await getPrivileged(ctx);
  if (priv.error) return fetchFailure(id, expected, priv.error);
  const bg = new Set(ctx.options.breakGlass.map((b) => b.id));

  const mfaPolicies = pol.data.filter((p) => p.state === "enabled" && grantMfa(p) && allApps(p));
  const covers = (p: CaPolicy, roleId: string) =>
    (allUsers(p) || has(p.conditions?.users?.includeRoles, roleId)) && !has(p.conditions?.users?.excludeRoles, roleId);
  const uncoveredRoles = priv.roles.filter((r) => !mfaPolicies.some((p) => covers(p, r.id)));

  // Users holding only uncovered roles may still be covered through group-scoped policies.
  const uncoveredRoleIds = new Set(uncoveredRoles.map((r) => r.id));
  const atRisk = [...priv.users.values()].filter((u) => !bg.has(u.id) && [...u.roles].every((r) => uncoveredRoleIds.has(r)));
  const groupIds = [...new Set(mfaPolicies.flatMap((p) => p.conditions?.users?.includeGroups ?? []))];
  const groupMembers = new Set<string>();
  await mapLimit(groupIds, 4, async (g) => {
    const m = await ctx.getAll<{ id: string }>(groupMembersPath(g));
    if (m.ok) m.data.forEach((u) => groupMembers.add(u.id));
  });
  const uncoveredUsers = atRisk.filter((u) => !groupMembers.has(u.id));

  const exclusionIssues = mfaPolicies
    .filter((p) => priv.roles.some((r) => covers(p, r.id)))
    .flatMap((p) => extraExclusions(p, bg).map((i) => `"${p.displayName}": ${i}`));

  const evidence: Evidence[] = [
    { source: priv.sources[0] ?? "", path: "privileged roles", value: priv.roles.length },
    { source: CA_POLICIES, path: "enforced MFA policies on all apps", value: mfaPolicies.map((p) => p.displayName) },
    { source: CA_POLICIES, path: "privileged roles not covered by role/All-users scope", value: uncoveredRoles.map((r) => r.displayName) },
  ];
  const table = uncoveredUsers.length
    ? { name: "privileged-users-without-mfa-policy", columns: ["User", "Roles"], rows: uncoveredUsers.map((u) => [label(u), [...u.roles].map((r) => priv.roles.find((x) => x.id === r)?.displayName ?? r).join("; ")]) }
    : undefined;

  let state: CheckState;
  let message: string;
  if (uncoveredUsers.length) {
    state = "Fail";
    message = `${uncoveredUsers.length} privileged user(s) are not covered by any enforced MFA policy: ${uncoveredUsers.slice(0, 5).map(label).join(", ")}${uncoveredUsers.length > 5 ? "…" : ""}.`;
  } else if (uncoveredRoles.length) {
    state = "Partial";
    message = `${uncoveredRoles.length} privileged role(s) are only covered through group-scoped policies: ${uncoveredRoles.slice(0, 6).map((r) => r.displayName).join(", ")}${uncoveredRoles.length > 6 ? "…" : ""}.`;
  } else {
    state = "Pass";
    message = "Every privileged role is covered by an enforced MFA policy.";
  }
  if (exclusionIssues.length) {
    state = worst(state, "Partial");
    message += ` Exclusions beyond break-glass: ${exclusionIssues.slice(0, 3).join("; ")}.`;
  }
  if (priv.notes.length) message += ` ${priv.notes.join(" ")}`;
  return result(id, expected, state, `${priv.roles.length - uncoveredRoles.length}/${priv.roles.length} roles covered`, message, evidence, table);
};

/** 5.2.2.4 — admin sessions need both sign-in frequency ≤ 4h and persistent browser = never. */
const adminSessions: Check = async (ctx, id, expected) => {
  const pol = await ctx.getAll<CaPolicy>(CA_POLICIES);
  if (!pol.ok) return fetchFailure(id, expected, pol);
  const bg = new Set(ctx.options.breakGlass.map((b) => b.id));
  const freq = evaluateCa(pol.data, {
    core: (p) => {
      const f = p.sessionControls?.signInFrequency;
      return !!f?.isEnabled && (f.frequencyInterval === "everyTime" || (f.type === "hours" && (f.value ?? 99) <= 4));
    },
    scope: "admins", requireAllApps: true, lookingFor: "sets sign-in frequency ≤ 4 hours for admins",
  }, bg);
  const browser = evaluateCa(pol.data, {
    core: (p) => !!p.sessionControls?.persistentBrowser?.isEnabled && p.sessionControls.persistentBrowser.mode === "never",
    scope: "admins", requireAllApps: true, lookingFor: "sets persistent browser session to never for admins",
  }, bg);
  const state = worst(freq.state, browser.state);
  return result(id, expected, state, `frequency: ${freq.state}, persistent browser: ${browser.state}`,
    `Sign-in frequency — ${freq.message} Persistent browser — ${browser.message}`, [...freq.evidence, ...browser.evidence]);
};

/** 5.2.2.7 — high and medium sign-in risk; high only is Partial. */
const signInRisk: Check = async (ctx, id, expected) => {
  const base = await caCheck({
    core: (p) => has(p.conditions?.signInRiskLevels, "high") && (grantMfa(p) || grantBlock(p)),
    scope: "allUsers", requireAllApps: true, lookingFor: "acts on high sign-in risk with MFA or block",
  }, { needsP2: true })(ctx, id, expected);
  if (base.state !== "Pass") return base;
  const pol = await ctx.getAll<CaPolicy>(CA_POLICIES);
  const medium = pol.ok && pol.data.some((p) => p.state === "enabled" && has(p.conditions?.signInRiskLevels, "medium") && (grantMfa(p) || grantBlock(p)));
  return medium ? base : { ...base, state: "Partial", message: `${base.message} Medium sign-in risk is not covered.` };
};

export const CA_CHECKS: Record<string, Check> = {
  "5.2.2.1": privilegedMfa,
  "5.2.2.2": caCheck({ core: grantMfa, scope: "allUsers", requireAllApps: true, lookingFor: "requires MFA for all users on all resources" }),
  "5.2.2.3": caCheck({
    core: (p) => grantBlock(p) && has(p.conditions?.clientAppTypes, "exchangeActiveSync") && has(p.conditions?.clientAppTypes, "other"),
    scope: "allUsers", requireAllApps: true, allowed: ["clientAppTypes"], lookingFor: "blocks legacy authentication (Exchange ActiveSync + other clients)",
  }),
  "5.2.2.4": adminSessions,
  "5.2.2.6": caCheck({
    core: (p) => {
      const g = p.grantControls?.builtInControls ?? [];
      return has(p.conditions?.userRiskLevels, "high") &&
        (has(g, "riskRemediation") || (grantMfa(p) && has(g, "passwordChange") && p.grantControls?.operator === "AND"));
    },
    scope: "allUsers", requireAllApps: true, lookingFor: "requires MFA + password change (or risk remediation) for high user risk",
  }, { needsP2: true }),
  "5.2.2.7": signInRisk,
  "5.2.2.9": caCheck({ core: grantManagedDevice, scope: "allUsers", requireAllApps: true, lookingFor: "requires a compliant or hybrid-joined device for all users" }),
  "5.2.2.10": caCheck({
    core: (p) => has(p.conditions?.applications?.includeUserActions, "urn:user:registersecurityinfo") && grantManagedDevice(p),
    scope: "allUsers", requireAllApps: false, lookingFor: "requires a managed device to register security info",
  }),
  "5.2.2.11": caCheck({
    core: (p) => has(p.conditions?.applications?.includeApplications, INTUNE_ENROLLMENT_APP) &&
      !!p.sessionControls?.signInFrequency?.isEnabled && p.sessionControls.signInFrequency.frequencyInterval === "everyTime",
    scope: "allUsers", requireAllApps: false, lookingFor: "requires sign-in every time for Microsoft Intune Enrollment",
  }),
  "5.2.2.12": caCheck({
    core: (p) => grantBlock(p) && transferMethods(p).includes("deviceCodeFlow"),
    scope: "allUsers", requireAllApps: true, lookingFor: "blocks the device code flow",
  }),
  "5.2.2.13": caCheck({
    core: (p) => !!p.sessionControls?.signInFrequency?.isEnabled,
    scope: "allUsers", requireAllApps: false, lookingFor: "sets a sign-in frequency for all users",
  }),
  "5.2.2.17": caCheck({
    core: (p) => grantBlock(p) && transferMethods(p).includes("authenticationTransfer"),
    scope: "allUsers", requireAllApps: true, lookingFor: "blocks authentication transfer",
  }),
};
