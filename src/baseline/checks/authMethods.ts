// ─── Authentication methods and password protection (5.2.3.x) ─────────────────

import type { CheckContext } from "../context";
import { fetchFailure, result } from "../context";
import type { CheckResult, Evidence } from "../types";
import { isHybrid } from "./directory";

type Check = (ctx: CheckContext, id: string, expected: string) => Promise<CheckResult>;

export const AUTH_METHODS = "/v1.0/policies/authenticationMethodsPolicy";
const AUTHENTICATOR = "/v1.0/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/MicrosoftAuthenticator";
export const GROUP_SETTINGS = "/v1.0/groupSettings";
const PASSWORD_RULE_TEMPLATE = "5cf42378-d67d-4f36-ba46-e8b86229381d";
const REGISTRATION = "/v1.0/reports/authenticationMethods/userRegistrationDetails?$filter=userType eq 'member'";

interface FeatureState { state?: string; includeTarget?: { id?: string } }

function feature(cfg: unknown, name: string): FeatureState | undefined {
  return (cfg as { featureSettings?: Record<string, FeatureState> })?.featureSettings?.[name];
}

const authenticatorContext: Check = async (ctx, id, expected) => {
  const r = await ctx.get<unknown>(AUTHENTICATOR);
  if (!r.ok) return fetchFailure(id, expected, r);
  const app = feature(r.data, "displayAppInformationRequiredState");
  const loc = feature(r.data, "displayLocationInformationRequiredState");
  const ok = (f?: FeatureState) => f?.state === "enabled" && f.includeTarget?.id === "all_users";
  const okCount = [app, loc].filter(ok).length;
  const ev: Evidence[] = [
    { source: AUTHENTICATOR, path: "featureSettings.displayAppInformationRequiredState", value: app ?? null },
    { source: AUTHENTICATOR, path: "featureSettings.displayLocationInformationRequiredState", value: loc ?? null },
  ];
  const describe = (f?: FeatureState) => `${f?.state ?? "unset"}${f?.includeTarget?.id ? ` for ${f.includeTarget.id}` : ""}`;
  return result(id, expected, okCount === 2 ? "Pass" : okCount === 1 ? "Partial" : "Fail",
    `app name: ${describe(app)}, location: ${describe(loc)}`,
    okCount === 2 ? "Authenticator shows the app name and location for all users."
      : "Both settings must be 'enabled' for all users ('default' means Microsoft-managed, not enforced).", ev);
};

const companionApp: Check = async (ctx, id, expected) => {
  const r = await ctx.get<unknown>(AUTHENTICATOR);
  if (!r.ok) return fetchFailure(id, expected, r);
  const f = feature(r.data, "companionAppAllowedState");
  const ok = f?.state === "disabled";
  return result(id, expected, ok ? "Pass" : "Fail", f?.state ?? "unset",
    ok ? "Authenticator Lite in Outlook is disabled." : `Authenticator Lite is '${f?.state ?? "unset"}'; set it to disabled.`,
    [{ source: AUTHENTICATOR, path: "featureSettings.companionAppAllowedState.state", value: f?.state ?? null }]);
};

/** Password Rule Settings values, or null when no settings object exists (tenant defaults apply). */
async function passwordRules(ctx: CheckContext) {
  const r = await ctx.getAll<{ templateId?: string; values?: Array<{ name: string; value: string }> }>(GROUP_SETTINGS);
  if (!r.ok) return r;
  const obj = r.data.find((s) => s.templateId === PASSWORD_RULE_TEMPLATE);
  return { ok: true as const, values: obj ? Object.fromEntries((obj.values ?? []).map((v) => [v.name, v.value])) : null };
}

const bannedPasswords: Check = async (ctx, id, expected) => {
  const pr = await passwordRules(ctx);
  if (!pr.ok) return fetchFailure(id, expected, pr);
  const v = pr.values;
  const enabled = v?.EnableBannedPasswordCheck?.toLowerCase() === "true";
  const list = (v?.BannedPasswordList ?? "").split(/\t|,/).map((s) => s.trim()).filter(Boolean);
  const ok = enabled && list.length > 0;
  return result(id, expected, ok ? "Pass" : "Fail", v ? `check ${enabled ? "on" : "off"}, ${list.length} word(s)` : "defaults (no settings)",
    ok ? `A custom banned password list with ${list.length} entr${list.length === 1 ? "y" : "ies"} is enforced.`
      : !v ? "No Password Rule Settings object exists, so no custom banned list is enforced." : "Enable the custom banned password check and add organisation-specific words.",
    [{ source: GROUP_SETTINGS, path: "Password Rule Settings.EnableBannedPasswordCheck", value: v?.EnableBannedPasswordCheck ?? null },
     { source: GROUP_SETTINGS, path: "Password Rule Settings.BannedPasswordList (count)", value: list.length }]);
};

const onPremProtection: Check = async (ctx, id, expected) => {
  if ((await isHybrid(ctx)) === false) {
    return result(id, expected, "NotApplicable", "cloud-only", "The tenant does not synchronise from on-premises.");
  }
  const pr = await passwordRules(ctx);
  if (!pr.ok) return fetchFailure(id, expected, pr);
  const v = pr.values;
  const enabled = v?.EnableBannedPasswordCheckOnPremises?.toLowerCase() === "true";
  const mode = v?.BannedPasswordCheckOnPremisesMode ?? "unset";
  const ok = enabled && mode.toLowerCase() === "enforce";
  return result(id, expected, ok ? "Pass" : enabled ? "Partial" : "Fail", `${enabled ? "enabled" : "disabled"}, mode ${mode}`,
    ok ? "Password protection for Windows Server AD is enabled and enforced." : enabled ? "Enabled, but in Audit mode; switch to Enforce." : "Password protection for Windows Server AD is not enabled.",
    [{ source: GROUP_SETTINGS, path: "EnableBannedPasswordCheckOnPremises", value: v?.EnableBannedPasswordCheckOnPremises ?? null },
     { source: GROUP_SETTINGS, path: "BannedPasswordCheckOnPremisesMode", value: mode }]);
};

function lockout(name: "LockoutThreshold" | "LockoutDurationInSeconds", fallback: number, ok: (n: number) => boolean, unit: string): Check {
  return async (ctx, id, expected) => {
    const pr = await passwordRules(ctx);
    if (!pr.ok) return fetchFailure(id, expected, pr);
    const raw = pr.values?.[name];
    const n = raw === undefined ? fallback : Number(raw);
    return result(id, expected, ok(n) ? "Pass" : "Fail", `${n}${raw === undefined ? " (default)" : ""}`,
      `${name} is ${n} ${unit}${raw === undefined ? " (tenant default)" : ""}.`,
      [{ source: GROUP_SETTINGS, path: `Password Rule Settings.${name}`, value: raw ?? `default ${fallback}` }]);
  };
}

const mfaCapable: Check = async (ctx, id, expected) => {
  const r = await ctx.getAll<{ id: string; userPrincipalName?: string; userDisplayName?: string; isMfaCapable?: boolean }>(REGISTRATION);
  if (!r.ok) return fetchFailure(id, expected, r);
  const disabled = await ctx.getAll<{ id: string }>("/v1.0/users?$filter=accountEnabled eq false&$select=id");
  const skip = new Set([
    ...ctx.options.breakGlass.map((b) => b.id),
    ...(disabled.ok ? disabled.data.map((u) => u.id) : []),
  ]);
  const inScope = r.data.filter((u) => !skip.has(u.id));
  const notCapable = inScope.filter((u) => !u.isMfaCapable);
  const pct = inScope.length ? Math.round(((inScope.length - notCapable.length) / inScope.length) * 1000) / 10 : 100;
  const excluded = r.data.length - inScope.length;
  return result(id, expected, notCapable.length ? "Fail" : "Pass", `${pct}% (${inScope.length - notCapable.length}/${inScope.length})`,
    notCapable.length
      ? `${notCapable.length} member user(s) are not MFA capable. Download the list from this check.${excluded ? ` ${excluded} disabled / break-glass account(s) excluded.` : ""}`
      : `All ${inScope.length} in-scope member users are MFA capable.`,
    [{ source: REGISTRATION, path: "isMfaCapable = false (in scope)", value: notCapable.length },
     { source: "/v1.0/users?$filter=accountEnabled eq false", path: "excluded disabled accounts", value: disabled.ok ? disabled.data.length : "not read" }],
    notCapable.length ? { name: "users-not-mfa-capable", columns: ["User", "Display name"], rows: notCapable.map((u) => [u.userPrincipalName ?? u.id, u.userDisplayName ?? ""]) } : undefined);
};

const smsVoice: Check = async (ctx, id, expected) => {
  const r = await ctx.get<{ authenticationMethodConfigurations?: Array<{ id: string; state: string }> }>(AUTH_METHODS);
  if (!r.ok) return fetchFailure(id, expected, r);
  const state = (m: string) => r.data.authenticationMethodConfigurations?.find((c) => c.id.toLowerCase() === m)?.state ?? "unknown";
  const sms = state("sms");
  const voice = state("voice");
  const enabled = [sms === "enabled" ? "SMS" : "", voice === "enabled" ? "Voice" : ""].filter(Boolean);
  return result(id, expected, enabled.length ? "Fail" : "Pass", `SMS ${sms}, Voice ${voice}`,
    enabled.length ? `${enabled.join(" and ")} still enabled as authentication method.` : "SMS and voice call are disabled.",
    [{ source: AUTH_METHODS, path: "authenticationMethodConfigurations[Sms].state", value: sms },
     { source: AUTH_METHODS, path: "authenticationMethodConfigurations[Voice].state", value: voice }]);
};

const systemPreferred: Check = async (ctx, id, expected) => {
  const r = await ctx.get<{ systemCredentialPreferences?: { state?: string; includeTargets?: Array<{ id: string }> } }>(AUTH_METHODS);
  if (!r.ok) return fetchFailure(id, expected, r);
  const p = r.data.systemCredentialPreferences;
  const all = !!p?.includeTargets?.some((t) => t.id === "all_users");
  const ok = p?.state === "enabled" && all;
  return result(id, expected, ok ? "Pass" : p?.state === "enabled" ? "Partial" : "Fail", `${p?.state ?? "unset"}${all ? " for all users" : ""}`,
    ok ? "System-preferred MFA is enabled for all users." : p?.state === "enabled" ? "Enabled, but not for all users." : `System-preferred MFA is '${p?.state ?? "unset"}' ('default' means Microsoft-managed).`,
    [{ source: AUTH_METHODS, path: "systemCredentialPreferences", value: p ?? null }]);
};

export const AUTH_CHECKS: Record<string, Check> = {
  "5.2.3.1": authenticatorContext,
  "5.2.3.2": bannedPasswords,
  "5.2.3.3": onPremProtection,
  "5.2.3.4": mfaCapable,
  "5.2.3.5": smsVoice,
  "5.2.3.6": systemPreferred,
  "5.2.3.8": lockout("LockoutThreshold", 10, (n) => n <= 10, "failed attempts"),
  "5.2.3.9": lockout("LockoutDurationInSeconds", 60, (n) => n >= 60, "seconds"),
  "5.2.3.10": companionApp,
};
