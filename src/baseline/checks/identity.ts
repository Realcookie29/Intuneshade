// ─── Admin account checks (1.1.x) and per-user MFA (5.1.2.1) ──────────────────

import type { CheckContext } from "../context";
import { fetchFailure, mapLimit, result } from "../context";
import type { CheckResult, Evidence } from "../types";
import { CA_POLICIES, type CaPolicy } from "./ca";
import { ROLE_GLOBAL_ADMIN, getPrivileged, label, userPath, type UserDetails } from "./roles";

type Check = (ctx: CheckContext, id: string, expected: string) => Promise<CheckResult>;

const GA_SCHEDULES = `/v1.0/roleManagement/directory/roleAssignmentSchedules?$filter=roleDefinitionId eq '${ROLE_GLOBAL_ADMIN}'`;

/** Productivity service plans an admin account should not carry. */
const PRODUCTIVITY_PLANS = new Set([
  "EXCHANGE_S_ENTERPRISE", "EXCHANGE_S_STANDARD", "EXCHANGE_S_DESKLESS",
  "SHAREPOINTENTERPRISE", "SHAREPOINTSTANDARD", "SHAREPOINTDESKLESS",
  "TEAMS1", "MCOSTANDARD", "OFFICESUBSCRIPTION", "MCOEV",
]);

async function userDetails(ctx: CheckContext, id: string): Promise<UserDetails | null> {
  const r = await ctx.get<UserDetails>(userPath(id));
  return r.ok ? r.data : null;
}

/** Users that hold Global Administrator, plus which of them are permanently active. */
async function globalAdmins(ctx: CheckContext) {
  const priv = await getPrivileged(ctx);
  if (priv.error) return { error: priv.error } as const;
  const gas = [...priv.users.values()].filter((u) => u.roles.has(ROLE_GLOBAL_ADMIN));
  const schedules = await ctx.getAll<{ principalId: string; assignmentType?: string; scheduleInfo?: { expiration?: { type?: string } } }>(GA_SCHEDULES);
  const permanent = new Set<string>();
  let note = "";
  if (schedules.ok) {
    for (const s of schedules.data) {
      if (s.assignmentType !== "Activated" && s.scheduleInfo?.expiration?.type === "noExpiration") permanent.add(s.principalId);
    }
    // Direct user assignments appear by principal; group-based ones by group — treat active members of those as permanent too.
    for (const u of gas) if (u.active && u.viaGroup) permanent.add(u.id);
  } else {
    note = `Assignment schedules not readable (${schedules.error}); active assignments are treated as permanent.`;
    for (const u of gas) if (u.active) permanent.add(u.id);
  }
  return { gas, permanent, notes: [...priv.notes, note].filter(Boolean), sources: [...priv.sources, GA_SCHEDULES] } as const;
}

const cloudOnly: Check = async (ctx, id, expected) => {
  const priv = await getPrivileged(ctx);
  if (priv.error) return fetchFailure(id, expected, priv.error);
  const users = [...priv.users.values()];
  const details = await mapLimit(users, 5, (u) => userDetails(ctx, u.id));
  const synced = users.filter((_, i) => details[i]?.onPremisesSyncEnabled === true);
  const unknown = users.filter((_, i) => details[i] === null);
  const evidence: Evidence[] = [
    { source: priv.sources.join(" + "), path: "privileged users (active + eligible, groups expanded)", value: users.length },
    ...synced.slice(0, 20).map((u) => ({ source: userPath(u.id), path: "onPremisesSyncEnabled", value: true })),
  ];
  const notes = [...priv.notes, unknown.length ? `${unknown.length} user(s) could not be read.` : ""].filter(Boolean).join(" ");
  if (synced.length) {
    return result(id, expected, "Fail", `${synced.length} synced privileged user(s)`,
      `Synchronised from on-premises: ${synced.slice(0, 5).map(label).join(", ")}${synced.length > 5 ? "…" : ""}. ${notes}`.trim(), evidence,
      { name: "synced-privileged-users", columns: ["User"], rows: synced.map((u) => [label(u)]) });
  }
  return result(id, expected, unknown.length ? "Partial" : "Pass", `${users.length} privileged user(s), none synced`,
    `All ${users.length - unknown.length} readable privileged users are cloud-only. ${notes}`.trim(), evidence);
};

const breakGlass: Check = async (ctx, id, expected) => {
  const tagged = ctx.options.breakGlass;
  if (tagged.length < 2) {
    return result(id, expected, "Manual", `${tagged.length} tagged`,
      "Tag at least two break-glass accounts under Run options; they are then verified automatically and treated as allowed CA exclusions.");
  }
  const ga = await globalAdmins(ctx);
  if ("error" in ga && ga.error) return fetchFailure(id, expected, ga.error);
  const { permanent } = ga as Exclude<typeof ga, { error: unknown }>;
  const pol = await ctx.getAll<CaPolicy>(CA_POLICIES);
  if (!pol.ok) return fetchFailure(id, expected, pol);
  const enabled = pol.data.filter((p) => p.state === "enabled");

  const problems: string[] = [];
  const evidence: Evidence[] = [];
  await mapLimit(tagged, 3, async (acc) => {
    const d = await userDetails(ctx, acc.id);
    const memberOf = await ctx.getAll<{ id: string }>(`/v1.0/users/${acc.id}/transitiveMemberOf?$select=id`);
    const groups = new Set(memberOf.ok ? memberOf.data.map((g) => g.id) : []);
    const name = acc.userPrincipalName || acc.displayName;
    if (!d) problems.push(`${name}: account not found`);
    else if (d.onPremisesSyncEnabled === true) problems.push(`${name}: synced from on-premises`);
    if (!permanent.has(acc.id)) problems.push(`${name}: not a permanent active Global Administrator`);
    const notExcluded = enabled.filter((p) => {
      const u = p.conditions?.users ?? {};
      const dedicated = u.includeUsers?.includes(acc.id);
      const excluded = u.excludeUsers?.includes(acc.id) || u.excludeGroups?.some((g) => groups.has(g));
      return !dedicated && !excluded;
    });
    if (notExcluded.length) problems.push(`${name}: not excluded from ${notExcluded.map((p) => `"${p.displayName}"`).join(", ")}`);
    evidence.push({ source: userPath(acc.id), path: "onPremisesSyncEnabled", value: d?.onPremisesSyncEnabled ?? null });
    evidence.push({ source: CA_POLICIES, path: `enabled policies not excluding ${name}`, value: notExcluded.length });
  });
  return problems.length
    ? result(id, expected, "Fail", `${tagged.length} tagged, ${problems.length} issue(s)`, problems.join("; ") + ".", evidence)
    : result(id, expected, "Pass", `${tagged.length} tagged, all verified`,
      "All tagged accounts are cloud-only, permanent active Global Administrators and excluded from every enabled CA policy except their own.", evidence);
};

const gaCount: Check = async (ctx, id, expected) => {
  const ga = await globalAdmins(ctx);
  if ("error" in ga && ga.error) return fetchFailure(id, expected, ga.error);
  const { gas, permanent, notes, sources } = ga as Exclude<typeof ga, { error: unknown }>;
  const active = gas.filter((u) => u.active).length;
  const eligible = gas.filter((u) => u.eligible && !u.active).length;
  const n = gas.length;
  const bg = new Set(ctx.options.breakGlass.map((b) => b.id));
  const permanentNonBg = gas.filter((u) => permanent.has(u.id) && !bg.has(u.id));
  const evidence: Evidence[] = [
    { source: sources.join(" + "), path: "distinct Global Administrator users", value: n },
    { source: sources.join(" + "), path: "active / eligible-only", value: `${active} / ${eligible}` },
  ];
  const table = { name: "global-administrators", columns: ["User", "Active", "Eligible", "Permanent", "Break-glass"],
    rows: gas.map((u) => [label(u), u.active ? "yes" : "", u.eligible ? "yes" : "", permanent.has(u.id) ? "yes" : "", bg.has(u.id) ? "yes" : ""]) };
  const extra = notes.join(" ");
  if (n < 2 || n > 4) {
    return result(id, expected, "Fail", `${n} (${active} active, ${eligible} eligible)`,
      `${n} Global Administrator${n === 1 ? "" : "s"}; expected between two and four. ${extra}`.trim(), evidence, table);
  }
  if (bg.size && permanentNonBg.length) {
    return result(id, expected, "Partial", `${n} (${active} active, ${eligible} eligible)`,
      `Count is fine, but ${permanentNonBg.length} permanent active GA(s) are not tagged break-glass: ${permanentNonBg.map(label).join(", ")}. Make them eligible via PIM. ${extra}`.trim(), evidence, table);
  }
  return result(id, expected, "Pass", `${n} (${active} active, ${eligible} eligible)`,
    `${n} Global Administrators.${bg.size ? "" : " Tag break-glass accounts to also flag permanent active GAs."} ${extra}`.trim(), evidence, table);
};

const adminLicences: Check = async (ctx, id, expected) => {
  const priv = await getPrivileged(ctx);
  if (priv.error) return fetchFailure(id, expected, priv.error);
  const users = [...priv.users.values()];
  const offenders: Array<{ user: string; plans: string[] }> = [];
  let unreadable = 0;
  await mapLimit(users, 5, async (u) => {
    const lic = await ctx.getAll<{ servicePlans?: Array<{ servicePlanName: string; provisioningStatus?: string }> }>(`/v1.0/users/${u.id}/licenseDetails`);
    if (!lic.ok) { unreadable++; return; }
    const plans = lic.data.flatMap((l) => l.servicePlans ?? [])
      .filter((p) => PRODUCTIVITY_PLANS.has(p.servicePlanName) && p.provisioningStatus !== "Disabled")
      .map((p) => p.servicePlanName);
    if (plans.length) offenders.push({ user: label(u), plans: [...new Set(plans)] });
  });
  const evidence: Evidence[] = offenders.slice(0, 20).map((o) => ({ source: "/v1.0/users/{id}/licenseDetails", path: o.user, value: o.plans }));
  if (offenders.length) {
    return result(id, expected, "Fail", `${offenders.length} admin(s) with productivity licences`,
      `Mailbox / SharePoint / Teams enabled for: ${offenders.slice(0, 5).map((o) => o.user).join(", ")}${offenders.length > 5 ? "…" : ""}. Use separate admin accounts without productivity workloads.`,
      evidence, { name: "licensed-admins", columns: ["User", "Productivity plans"], rows: offenders.map((o) => [o.user, o.plans.join("; ")]) });
  }
  return result(id, expected, unreadable ? "Partial" : "Pass", `${users.length} privileged user(s) checked`,
    unreadable ? `${unreadable} user(s) could not be read; the rest have no productivity workloads.` : "No privileged user has productivity workloads enabled.", evidence);
};

const perUserMfa: Check = async (ctx, id, expected) => {
  let targets: Array<{ id: string; userPrincipalName?: string; displayName?: string }>;
  let scope: string;
  if (ctx.options.fullPerUserMfaScan) {
    const all = await ctx.getAll<{ id: string; userPrincipalName?: string }>("/v1.0/users?$select=id,userPrincipalName&$filter=userType eq 'Member'");
    if (!all.ok) return fetchFailure(id, expected, all);
    targets = all.data;
    scope = `full scan of ${targets.length} member users`;
  } else {
    const priv = await getPrivileged(ctx);
    if (priv.error) return fetchFailure(id, expected, priv.error);
    targets = [...priv.users.values()];
    scope = `quick scan of ${targets.length} privileged users (enable the full scan under Run options)`;
  }
  const flagged: string[] = [];
  let firstFailure: { status: number; error: string; path: string } | null = null;
  let read = 0;
  await mapLimit(targets, 6, async (u) => {
    const r = await ctx.get<{ perUserMfaState?: string }>(`/beta/users/${u.id}/authentication/requirements`);
    if (!r.ok) { firstFailure ??= r; return; }
    read++;
    if (r.data.perUserMfaState === "enabled" || r.data.perUserMfaState === "enforced") flagged.push(label(u));
  });
  if (!read && firstFailure) return fetchFailure(id, expected, firstFailure, true);
  const evidence: Evidence[] = [{ source: "/beta/users/{id}/authentication/requirements", path: "perUserMfaState", value: `${flagged.length} enabled/enforced of ${read} read` }];
  if (flagged.length) {
    return result(id, expected, "Fail", `${flagged.length} user(s) with per-user MFA`,
      `Per-user MFA is enabled or enforced for ${flagged.slice(0, 5).join(", ")}${flagged.length > 5 ? "…" : ""} (${scope}). Use Conditional Access instead.`,
      evidence, { name: "per-user-mfa", columns: ["User"], rows: flagged.map((u) => [u]) });
  }
  return result(id, expected, "Pass", "none found", `No per-user MFA found (${scope}).`, evidence);
};

export const IDENTITY_CHECKS: Record<string, Check> = {
  "1.1.1": cloudOnly,
  "1.1.2": breakGlass,
  "1.1.3": gaCount,
  "1.1.4": adminLicences,
  "5.1.2.1": perUserMfa,
};
