// ─── Windows device settings — pure evaluation engine ────────────────────────
// Judges configuration *intent*: which value Intune would push to the devices
// in scope, based on assigned settings catalog / endpoint security policies.
// It does not read device state. No Graph access here — the collector in
// checks/windows.ts feeds it, tests feed it fixtures.
//
// Rules, as an enterprise admin would expect them:
//  - only assigned policies count; a setting that only lives in an unassigned
//    policy is a Fail ("configured, but not assigned");
//  - per device (deployment-profile scope) or tenant-wide, the policies that
//    target it are combined; different values for one setting = Conflict,
//    which Intune does not apply → Partial;
//  - assignment filters are not evaluated, only flagged for the admin.

import type { CheckState } from "../types";
import type { SettingRule, WindowsMapping } from "./mapping";

// ─── Settings ─────────────────────────────────────────────────────────────────

/** Configured value per definition id: a choice option id, a number/string, or a list. */
export type SettingValue = string | number | boolean | string[];
export type FlatSettings = Map<string, SettingValue>;

interface Instance {
  "@odata.type"?: string;
  settingDefinitionId?: string;
  choiceSettingValue?: { value?: string; children?: Instance[] };
  choiceSettingCollectionValue?: Array<{ value?: string; children?: Instance[] }>;
  simpleSettingValue?: { value?: string | number | boolean };
  simpleSettingCollectionValue?: Array<{ value?: string | number }>;
  groupSettingValue?: { children?: Instance[] };
  groupSettingCollectionValue?: Array<{ children?: Instance[] }>;
}

/** Flattens a policy's `/settings` response (nested choice children, groups, collections) into defId → value. */
export function flattenSettings(items: Array<{ settingInstance?: Instance }>): FlatSettings {
  const out: FlatSettings = new Map();
  const walk = (inst: Instance | undefined) => {
    if (!inst?.settingDefinitionId) return;
    const id = inst.settingDefinitionId.toLowerCase();
    if (inst.choiceSettingValue) {
      if (inst.choiceSettingValue.value != null) out.set(id, inst.choiceSettingValue.value.toLowerCase());
      inst.choiceSettingValue.children?.forEach(walk);
    } else if (inst.choiceSettingCollectionValue) {
      out.set(id, inst.choiceSettingCollectionValue.map((v) => String(v.value ?? "").toLowerCase()));
      inst.choiceSettingCollectionValue.forEach((v) => v.children?.forEach(walk));
    } else if (inst.simpleSettingValue) {
      const v = inst.simpleSettingValue.value;
      if (v != null) out.set(id, v);
    } else if (inst.simpleSettingCollectionValue) {
      out.set(id, inst.simpleSettingCollectionValue.map((v) => String(v.value ?? "")));
    } else if (inst.groupSettingValue) {
      out.set(id, "configured");
      inst.groupSettingValue.children?.forEach(walk);
    } else if (inst.groupSettingCollectionValue) {
      out.set(id, "configured");
      inst.groupSettingCollectionValue.forEach((g) => g.children?.forEach(walk));
    }
  };
  for (const item of items) walk(item.settingInstance);
  return out;
}

// ─── Policies and assignments ─────────────────────────────────────────────────

export interface PolicyAssignment {
  kind: "allDevices" | "allUsers" | "include" | "exclude";
  groupId?: string;
  filterId?: string;
  filterType?: string;
}

export interface WindowsPolicy {
  id: string;
  name: string;
  /** "Settings catalog", "Endpoint security", … — shown in evidence. */
  family: string;
  assignments: PolicyAssignment[];
  settings: FlatSettings;
}

/** Legacy policy types the engine cannot read settings from (templates, intents, admin templates, update rings). */
export interface LegacyPolicy {
  id: string;
  name: string;
  family: string;
  assignments: PolicyAssignment[];
}

interface RawTarget {
  "@odata.type"?: string;
  groupId?: string;
  deviceAndAppManagementAssignmentFilterId?: string | null;
  deviceAndAppManagementAssignmentFilterType?: string | null;
}

export function toAssignments(raw: Array<{ target?: RawTarget }> | undefined): PolicyAssignment[] {
  const out: PolicyAssignment[] = [];
  for (const a of raw ?? []) {
    const t = a.target ?? {};
    const type = (t["@odata.type"] ?? "").toLowerCase();
    const filter = t.deviceAndAppManagementAssignmentFilterId && t.deviceAndAppManagementAssignmentFilterType !== "none"
      ? { filterId: t.deviceAndAppManagementAssignmentFilterId, filterType: t.deviceAndAppManagementAssignmentFilterType ?? undefined }
      : {};
    if (type.includes("alldevices")) out.push({ kind: "allDevices", ...filter });
    else if (type.includes("alllicensedusers")) out.push({ kind: "allUsers", ...filter });
    else if (type.includes("exclusiongroup")) out.push({ kind: "exclude", groupId: t.groupId });
    else if (type.includes("group") && t.groupId) out.push({ kind: "include", groupId: t.groupId, ...filter });
  }
  return out;
}

export const isAssigned = (p: { assignments: PolicyAssignment[] }) => p.assignments.some((a) => a.kind !== "exclude");

// ─── Scope ────────────────────────────────────────────────────────────────────

export interface ScopeDevice { id: string; name: string; groups: Set<string> }

export type EvalScope =
  | { kind: "tenant" }
  | { kind: "profile"; name: string; devices: ScopeDevice[]; unresolved: number };

/** How a policy reaches one device: not at all, or yes (optionally through a filter we cannot evaluate). */
function reachesDevice(p: { assignments: PolicyAssignment[] }, d: ScopeDevice): { hit: boolean; filtered: boolean } {
  if (p.assignments.some((a) => a.kind === "exclude" && a.groupId && d.groups.has(a.groupId))) return { hit: false, filtered: false };
  const inc = p.assignments.filter((a) => a.kind === "allDevices" || a.kind === "allUsers" || (a.kind === "include" && a.groupId && d.groups.has(a.groupId)));
  return { hit: inc.length > 0, filtered: inc.length > 0 && inc.every((a) => !!a.filterId) };
}

/** Tenant-wide reach: "all" when assigned to All devices / All users without exclusions, "some" for group-only or with exclusions. */
function tenantReach(p: { assignments: PolicyAssignment[] }): "all" | "some" | "none" {
  const broad = p.assignments.some((a) => a.kind === "allDevices" || a.kind === "allUsers");
  const excluded = p.assignments.some((a) => a.kind === "exclude");
  if (broad && !excluded) return "all";
  return p.assignments.some((a) => a.kind !== "exclude") ? "some" : "none";
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export type Verdict = "ok" | "partial" | "wrong";

/** Option labels from the tenant's catalog (defId → option id → display name), for readable "actual" values. */
export type OptionLabels = Map<string, Map<string, string>>;

const normSid = (s: string) => s.trim().replace(/^\*/, "").toUpperCase();
const SID_NAMES: Record<string, string> = {
  "LOCAL SERVICE": "S-1-5-19", "NETWORK SERVICE": "S-1-5-20", "ADMINISTRATORS": "S-1-5-32-544", "SERVICE": "S-1-5-6",
};

export function display(def: string, value: SettingValue, labels?: OptionLabels): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(empty)";
  if (typeof value === "string" && value.startsWith(def)) {
    return labels?.get(def)?.get(value) ?? value.slice(def.length + 1);
  }
  return String(value);
}

/** Checks one configured value against a (non-composite) rule. */
export function judge(def: string, value: SettingValue, rule: SettingRule): Verdict {
  switch (rule.t) {
    case "choice": {
      const v = String(value);
      if (rule.ok.some((s) => v === def + s)) return "ok";
      if (rule.partial?.some((s) => v === def + s)) return "partial";
      return "wrong";
    }
    case "int": {
      const n = Number(value);
      if (!Number.isFinite(n)) return "wrong";
      if (rule.notZero && n === 0) return "wrong";
      if (rule.min != null && n < rule.min) return "wrong";
      if (rule.max != null && n > rule.max) return "wrong";
      return "ok";
    }
    case "text": {
      const s = String(value).trim();
      if (rule.equals == null) return s ? "ok" : "wrong";
      return s.toLowerCase() === rule.equals.toLowerCase() ? "ok" : "wrong";
    }
    case "sids": {
      const list = (Array.isArray(value) ? value : String(value).split(/[,;]/)).map((x) => SID_NAMES[x.trim().toUpperCase()] ?? normSid(x)).filter(Boolean);
      const want = new Set(rule.sids.map(normSid));
      const have = new Set(list);
      return have.size === want.size && [...want].every((s) => have.has(s)) ? "ok" : "wrong";
    }
    case "all":
      return "wrong";
  }
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

export interface Hit { policy: WindowsPolicy; value: SettingValue; filtered: boolean }

/** What a set of reaching policies configures for one definition (first alternative that is configured). */
function valuesFor(defs: string[], reaching: Array<{ policy: WindowsPolicy; filtered: boolean }>): { def: string; hits: Hit[] } {
  for (const def of defs) {
    const hits = reaching.flatMap(({ policy, filtered }) => policy.settings.has(def) ? [{ policy, value: policy.settings.get(def)!, filtered }] : []);
    if (hits.length) return { def, hits };
  }
  return { def: defs[0], hits: [] };
}

type TargetOutcome =
  | { kind: "missing" }
  | { kind: "conflict"; hits: Hit[]; def: string }
  | { kind: "value"; verdict: Verdict; hits: Hit[]; def: string; detail?: string };

const same = (a: SettingValue, b: SettingValue) => JSON.stringify(a) === JSON.stringify(b);

/** Outcome of one mapping for the policies that reach a single target (a device, or the tenant as a whole). */
function outcomeFor(m: { def: string | string[]; rule: SettingRule }, reaching: Array<{ policy: WindowsPolicy; filtered: boolean }>): TargetOutcome {
  if (m.rule.t === "all") {
    const subs = m.rule.children.map((c) => ({ c, o: outcomeFor({ def: c.def, rule: c.rule }, reaching) }));
    const okCount = subs.filter((s) => s.o.kind === "value" && s.o.verdict === "ok").length;
    const anyConfigured = subs.some((s) => s.o.kind !== "missing");
    if (!anyConfigured) return { kind: "missing" };
    const failing = subs.filter((s) => !(s.o.kind === "value" && s.o.verdict === "ok")).map((s) => s.c.label);
    const hits = subs.flatMap((s) => (s.o.kind === "missing" ? [] : s.o.hits));
    return {
      kind: "value",
      verdict: okCount === subs.length ? "ok" : okCount > 0 || subs.some((s) => s.o.kind === "value" && s.o.verdict === "partial") ? "partial" : "wrong",
      hits,
      def: Array.isArray(m.def) ? m.def[0] : m.def,
      detail: failing.length ? `${okCount}/${subs.length} in block mode; not blocking: ${failing.join("; ")}` : `${okCount}/${subs.length} in block mode`,
    };
  }
  const defs = (Array.isArray(m.def) ? m.def : [m.def]).map((d) => d.toLowerCase());
  const { def, hits } = valuesFor(defs, reaching);
  if (!hits.length) return { kind: "missing" };
  if (hits.some((h) => !same(h.value, hits[0].value))) return { kind: "conflict", hits, def };
  return { kind: "value", verdict: judge(def, hits[0].value, m.rule), hits, def };
}

export interface SettingEvaluation {
  state: CheckState;
  actual: string;
  message: string;
  /** Policy names that configure the setting for the scope (evidence). */
  policies: Array<{ id: string; name: string; family: string; value: string }>;
  /** Per-device detail for a deployment-profile scope. */
  table?: { name: string; columns: string[]; rows: string[][] };
}

export interface EvalInput {
  policies: WindowsPolicy[];
  legacy: LegacyPolicy[];
  scope: EvalScope;
  labels?: OptionLabels;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const names = (hits: Hit[]) => uniq(hits.map((h) => h.policy.name));

function evidenceOf(hits: Hit[], labels?: OptionLabels, def = ""): SettingEvaluation["policies"] {
  const seen = new Set<string>();
  return hits.filter((h) => !seen.has(h.policy.id) && seen.add(h.policy.id)).map((h) => ({
    id: h.policy.id, name: h.policy.name, family: h.policy.family, value: display(def, h.value, labels),
  }));
}

/** Where the setting does exist, but no assigned policy carries it — for the Fail message. */
function notAssignedNote(m: WindowsMapping, input: EvalInput): string {
  const defs = (Array.isArray(m.def) ? m.def : [m.def]).map((d) => d.toLowerCase());
  const childDefs = m.rule.t === "all" ? m.rule.children.map((c) => c.def.toLowerCase()) : [];
  const holders = input.policies.filter((p) => !isAssigned(p) && [...defs, ...childDefs].some((d) => p.settings.has(d)));
  return holders.length ? ` Configured in unassigned ${holders.length === 1 ? "policy" : "policies"}: ${holders.map((p) => `“${p.name}”`).join(", ")} — not applied to any device.` : "";
}

function filterNote(hits: Hit[]): string {
  const filtered = names(hits.filter((h) => h.filtered));
  return filtered.length ? ` Assignment filter on ${filtered.map((n) => `“${n}”`).join(", ")} — filters are not evaluated, verify they include these devices.` : "";
}

/** Evaluates one mapping for the chosen scope. */
export function evaluateSetting(m: WindowsMapping, input: EvalInput): SettingEvaluation {
  const { scope, labels } = input;
  const legacyNote = (n: number) => ` ${n} assigned legacy profile${n === 1 ? "" : "s"} (templates, security baselines, admin templates or update rings) ${n === 1 ? "was" : "were"} not inspected and may configure it — verify.`;
  const extra = m.note ? ` ${m.note}` : "";

  if (scope.kind === "tenant") {
    const all = input.policies.filter((p) => tenantReach(p) === "all").map((policy) => ({ policy, filtered: policy.assignments.some((a) => a.filterId) }));
    const some = input.policies.filter((p) => tenantReach(p) === "some").map((policy) => ({ policy, filtered: policy.assignments.some((a) => a.filterId) }));
    const broad = outcomeFor(m, all);
    if (broad.kind === "conflict") {
      return { state: "Partial", actual: "conflict", message: `Conflicting values in ${names(broad.hits).map((n) => `“${n}”`).join(", ")} — Intune does not apply a conflicting setting.${extra}`, policies: evidenceOf(broad.hits, labels, broad.def) };
    }
    if (broad.kind === "value") {
      const actual = broad.detail ?? display(broad.def, broad.hits[0].value, labels);
      const state: CheckState = broad.verdict === "ok" ? "Pass" : broad.verdict === "partial" ? "Partial" : "Fail";
      const what = broad.verdict === "ok" ? "Configured as expected" : broad.verdict === "partial" ? "Partly configured" : "Configured with a different value";
      return { state, actual, message: `${what} by ${names(broad.hits).map((n) => `“${n}”`).join(", ")} (assigned to all devices/users).${filterNote(broad.hits)}${extra}`, policies: evidenceOf(broad.hits, labels, broad.def) };
    }
    const partial = outcomeFor(m, some);
    if (partial.kind !== "missing") {
      const hits = partial.hits;
      const good = partial.kind === "value" && partial.verdict === "ok";
      return {
        state: good ? "Partial" : "Fail",
        actual: partial.kind === "conflict" ? "conflict" : partial.detail ?? display(partial.def, hits[0].value, labels),
        message: `${good ? "Configured as expected" : partial.kind === "conflict" ? "Conflicting values" : "Configured with a different value"} only in policies assigned to specific groups (${names(hits).map((n) => `“${n}”`).join(", ")}) — not every device is covered. Pick a deployment profile to see the real coverage.${extra}`,
        policies: evidenceOf(hits, labels, partial.def),
      };
    }
    const legacy = input.legacy.filter(isAssigned).length;
    if (legacy) return { state: "Manual", actual: "not found", message: `Not set in any assigned settings catalog or endpoint security policy.${legacyNote(legacy)}${notAssignedNote(m, input)}${extra}`, policies: [] };
    return { state: "Fail", actual: "not configured", message: `Not configured in Intune for all devices.${notAssignedNote(m, input)}${extra}`, policies: [] };
  }

  // ── Deployment profile scope: per device ────────────────────────────────────
  const devices = scope.devices;
  if (!devices.length) {
    return { state: "NotApplicable", actual: "no devices", message: `Deployment profile “${scope.name}” has no devices whose groups could be resolved.`, policies: [] };
  }
  const rows: string[][] = [];
  const allHits: Hit[] = [];
  let ok = 0, partial = 0, wrong = 0, missing = 0, conflict = 0;
  let firstDef = "";
  for (const d of devices) {
    const reaching = input.policies.flatMap((policy) => {
      const r = reachesDevice(policy, d);
      return r.hit ? [{ policy, filtered: r.filtered }] : [];
    });
    const o = outcomeFor(m, reaching);
    if (o.kind === "missing") { missing++; rows.push([d.name, "Not configured", ""]); continue; }
    allHits.push(...o.hits);
    firstDef ||= o.def;
    if (o.kind === "conflict") { conflict++; rows.push([d.name, "Conflict", names(o.hits).join("; ")]); continue; }
    if (o.verdict === "ok") ok++; else if (o.verdict === "partial") partial++; else wrong++;
    rows.push([d.name, o.verdict === "ok" ? "As expected" : o.verdict === "partial" ? "Partly" : `Different: ${o.detail ?? display(o.def, o.hits[0].value, labels)}`, names(o.hits).join("; ")]);
  }
  const total = devices.length;
  const unresolved = scope.unresolved ? ` ${scope.unresolved} device(s) in the profile could not be resolved and are not counted.` : "";
  const table = { name: `Devices in “${scope.name}”`, columns: ["Device", "Outcome", "Policies"], rows };
  const policies = evidenceOf(allHits, labels, firstDef);
  const parts = [ok && `${ok} as expected`, partial && `${partial} partly`, wrong && `${wrong} different value`, conflict && `${conflict} conflict`, missing && `${missing} not configured`].filter(Boolean).join(", ");

  if (ok === total) {
    return { state: "Pass", actual: `${ok}/${total} devices`, message: `Configured as expected on all ${total} devices of “${scope.name}” (${names(allHits).map((n) => `“${n}”`).join(", ")}).${filterNote(allHits)}${unresolved}${extra}`, policies, table };
  }
  if (missing === total) {
    const legacy = input.legacy.filter((p) => isAssigned(p) && devices.some((d) => reachesDevice(p, d).hit)).length;
    if (legacy) return { state: "Manual", actual: "not found", message: `No assigned settings catalog or endpoint security policy sets this for “${scope.name}”.${legacyNote(legacy)}${notAssignedNote(m, input)}${unresolved}${extra}`, policies, table };
    return { state: "Fail", actual: `0/${total} devices`, message: `Not configured for any device in “${scope.name}”.${notAssignedNote(m, input)}${unresolved}${extra}`, policies, table };
  }
  return {
    state: ok > 0 || partial > 0 ? "Partial" : "Fail",
    actual: `${ok}/${total} devices`,
    message: `“${scope.name}”: ${parts}.${conflict ? " Intune does not apply a conflicting setting." : ""}${filterNote(allHits)}${unresolved}${extra}`,
    policies,
    table,
  };
}
