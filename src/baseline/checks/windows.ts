// ─── Windows 11 device settings (CIS Windows L1 + BitLocker subset) ───────────
// Reads the Windows policy inventory + assignments through the check context
// (GET only), resolves the chosen scope (tenant-wide or the devices of one
// Autopilot deployment profile) and hands everything to the pure engine.

import type { CheckContext } from "../context";
import { fetchFailure, mapLimit, result } from "../context";
import type { CheckResult, Evidence, TenantCheck } from "../types";
import { AREA_SEVERITY, WINDOWS_MAPPINGS, windowsCheckId, type SettingRule, type WindowsMapping } from "../windows/mapping";
import {
  evaluateSetting, flattenSettings, isAssigned, toAssignments,
  type EvalScope, type LegacyPolicy, type OptionLabels, type ScopeDevice, type WindowsPolicy,
} from "../windows/engine";

type Check = (ctx: CheckContext, id: string, expected: string) => Promise<CheckResult>;

export const CONFIG_POLICIES = "/beta/deviceManagement/configurationPolicies?$select=id,name,platforms,technologies,templateReference";
const LEGACY_SOURCES: Array<{ path: string; family: string; keep?: (p: Record<string, unknown>) => boolean }> = [
  { path: "/beta/deviceManagement/deviceConfigurations?$expand=assignments", family: "Templates", keep: (p) => String(p["@odata.type"] ?? "").toLowerCase().startsWith("#microsoft.graph.windows") },
  { path: "/beta/deviceManagement/groupPolicyConfigurations?$expand=assignments", family: "Administrative templates" },
  { path: "/beta/deviceManagement/intents?$select=id,displayName,isAssigned", family: "Security baseline / legacy endpoint security" },
];
const catalogPath = (def: string) => `/beta/deviceManagement/configurationSettings/${def}`;

// ─── Static check definitions ─────────────────────────────────────────────────

const SUFFIX_LABEL: Record<string, string> = { _0: "Disabled", _1: "Enabled", _true: "Yes", _false: "No", _block: "Block", _warn: "Warn", _audit: "Audit" };

function describeRule(rule: SettingRule): string {
  switch (rule.t) {
    case "choice": return rule.ok.map((s) => SUFFIX_LABEL[s] ?? `option ${s.slice(1)}`).join(" or ");
    case "int": return [rule.min != null && `≥ ${rule.min}`, rule.max != null && `≤ ${rule.max}`, rule.notZero && "not 0"].filter(Boolean).join(", ");
    case "text": return rule.equals ?? "any non-empty value";
    case "sids": return `exactly ${rule.sids.join(", ")}`;
    case "all": return `all ${rule.children.length} rules in block (or warn) mode`;
  }
}

const defsOf = (m: WindowsMapping) => (Array.isArray(m.def) ? m.def : [m.def]);

export const WINDOWS_CHECKS: TenantCheck[] = WINDOWS_MAPPINGS.map((m) => ({
  id: windowsCheckId(m.cis),
  title: m.title,
  area: m.area,
  checkType: "auto",
  graph: ["GET /beta/deviceManagement/configurationPolicies", ...defsOf(m).map((d) => `GET ${catalogPath(d)}`)],
  rule: `Intune settings catalog: ${defsOf(m).join(" or ")}`,
  expected: describeRule(m.rule),
  severity: m.severity ?? AREA_SEVERITY[m.area],
  notes: m.note,
}));

const BY_ID = new Map(WINDOWS_MAPPINGS.map((m) => [windowsCheckId(m.cis), m]));

// ─── Inventory ────────────────────────────────────────────────────────────────

interface RawPolicy {
  id: string;
  name?: string;
  displayName?: string;
  platforms?: string;
  technologies?: string;
  templateReference?: { templateFamily?: string; templateDisplayName?: string };
  assignments?: Array<{ target?: Record<string, unknown> }>;
  isAssigned?: boolean;
  [k: string]: unknown;
}

function familyOf(p: RawPolicy): string {
  const fam = (p.templateReference?.templateFamily ?? "none").toLowerCase();
  if (fam === "none" || !fam) return "Settings catalog";
  if (fam.startsWith("endpointsecurity")) return `Endpoint security${p.templateReference?.templateDisplayName ? ` · ${p.templateReference.templateDisplayName}` : ""}`;
  if (fam === "baseline") return "Security baseline";
  return p.templateReference?.templateDisplayName ?? fam;
}

export interface WindowsInventory {
  ok: true;
  policies: WindowsPolicy[];
  legacy: LegacyPolicy[];
  warnings: string[];
}
type InventoryResult = WindowsInventory | { ok: false; status: number; error: string; path: string };

/** Every Windows settings catalog / endpoint security policy with its assignments and flattened settings. Memoised per run. */
export function windowsInventory(ctx: CheckContext): Promise<InventoryResult> {
  return ctx.memo("windows:inventory", async () => {
    const list = await ctx.getAll<RawPolicy>(CONFIG_POLICIES);
    if (!list.ok) return list;
    const windows = list.data.filter((p) => {
      const platforms = (p.platforms ?? "").toLowerCase();
      const tech = (p.technologies ?? "").toLowerCase();
      return platforms.includes("windows10") && (tech.includes("mdm") || tech.includes("microsoftsense"));
    });
    const warnings: string[] = [];
    const policies = await mapLimit(windows, 4, async (p): Promise<WindowsPolicy> => {
      const [assign, settings] = await Promise.all([
        ctx.getAll<{ target?: Record<string, unknown> }>(`/beta/deviceManagement/configurationPolicies('${p.id}')/assignments`),
        ctx.getAll<{ settingInstance?: never }>(`/beta/deviceManagement/configurationPolicies('${p.id}')/settings`),
      ]);
      if (!assign.ok || !settings.ok) warnings.push(`Policy “${p.name ?? p.id}” could not be read completely and is ignored.`);
      return {
        id: p.id,
        name: p.name ?? p.id,
        family: familyOf(p),
        assignments: assign.ok ? toAssignments(assign.data) : [],
        settings: settings.ok ? flattenSettings(settings.data) : new Map(),
      };
    });

    const legacy: LegacyPolicy[] = [];
    for (const src of LEGACY_SOURCES) {
      const r = await ctx.getAll<RawPolicy>(src.path);
      if (!r.ok) {
        warnings.push(`${src.family}: ${r.error} — not taken into account.`);
        continue;
      }
      for (const p of r.data) {
        if (src.keep && !src.keep(p)) continue;
        // Intents only expose isAssigned in the list; treat an assigned intent as reaching every device (it may — verify).
        const assignments = p.assignments ? toAssignments(p.assignments) : p.isAssigned ? [{ kind: "allDevices" as const }] : [];
        legacy.push({ id: p.id, name: p.displayName ?? p.name ?? p.id, family: src.family, assignments });
      }
    }
    return { ok: true as const, policies, legacy, warnings };
  });
}

// ─── Scope ────────────────────────────────────────────────────────────────────

type ScopeResult = { ok: true; scope: EvalScope } | { ok: false; error: string; path: string; status: number };

const esc = (s: string) => s.replace(/'/g, "''");

/** The devices of an Autopilot deployment profile with their transitive Entra groups. Memoised per run. */
export function windowsScope(ctx: CheckContext): Promise<ScopeResult> {
  return ctx.memo("windows:scope", async (): Promise<ScopeResult> => {
    const pref = ctx.options.deviceScope;
    if (!pref || pref.kind === "tenant") return { ok: true, scope: { kind: "tenant" } };

    const path = `/beta/deviceManagement/windowsAutopilotDeploymentProfiles/${pref.id}/assignedDevices`;
    const r = await ctx.getAll<Record<string, unknown>>(path);
    if (!r.ok) return r;
    let unresolved = 0;
    const devices = await mapLimit(r.data, 6, async (d): Promise<ScopeDevice | null> => {
      const aad = String(d.azureActiveDirectoryDeviceId ?? "");
      const label = String(d.displayName || d.serialNumber || aad || d.id);
      if (!aad || /^0{8}-/.test(aad)) { unresolved++; return null; }
      const entra = await ctx.get<{ value?: Array<{ id: string; displayName?: string }> }>(
        `/v1.0/devices?$filter=deviceId eq '${esc(aad)}'&$select=id,displayName`,
      );
      const obj = entra.ok ? entra.data.value?.[0] : undefined;
      if (!obj) { unresolved++; return null; }
      const groups = await ctx.getAll<{ id: string }>(`/v1.0/devices/${obj.id}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`);
      if (!groups.ok) { unresolved++; return null; }
      return { id: obj.id, name: obj.displayName || label, groups: new Set(groups.data.map((g) => g.id)) };
    });
    return { ok: true, scope: { kind: "profile", name: pref.name, devices: devices.filter((d): d is ScopeDevice => !!d), unresolved } };
  });
}

/** One-line description of the scope for the activity feed and reports. */
export async function describeWindowsScope(ctx: CheckContext): Promise<string> {
  const s = await windowsScope(ctx);
  if (!s.ok) return `deployment profile could not be read (${s.error})`;
  if (s.scope.kind === "tenant") return "tenant-wide (policies assigned to all devices / all users)";
  return `deployment profile “${s.scope.name}” — ${s.scope.devices.length} device(s)${s.scope.unresolved ? `, ${s.scope.unresolved} unresolved` : ""}`;
}

// ─── Catalog verification ─────────────────────────────────────────────────────

interface Definition { id: string; displayName?: string; options?: Array<{ itemId?: string; displayName?: string }> }

interface Verified { review: string | null; displayName?: string; labels: OptionLabels; expected?: string }

/** Checks the mapping against the tenant's own settings catalog: ids exist and the expected options are real. */
async function verifyMapping(ctx: CheckContext, m: WindowsMapping): Promise<Verified> {
  const labels: OptionLabels = new Map();
  const missing: string[] = [];
  let displayName: string | undefined;
  let expected: string | undefined;

  const lookup = async (def: string, rule: SettingRule) => {
    const r = await ctx.get<Definition>(catalogPath(def));
    if (!r.ok) return r.status === 404 ? "missing" : "unknown";
    const opts = r.data.options ?? [];
    if (opts.length) labels.set(def.toLowerCase(), new Map(opts.map((o) => [String(o.itemId ?? "").toLowerCase(), o.displayName ?? ""])));
    if (rule.t === "choice" && opts.length) {
      const ids = new Set(opts.map((o) => String(o.itemId ?? "").toLowerCase()));
      const known = rule.ok.filter((s) => ids.has(`${def}${s}`.toLowerCase()));
      if (!known.length) return "badOption";
      return { name: r.data.displayName, expected: known.map((s) => labels.get(def.toLowerCase())?.get(`${def}${s}`.toLowerCase())).filter(Boolean).join(" or ") };
    }
    return { name: r.data.displayName, expected: undefined };
  };

  const defs = defsOf(m);
  const outcomes = await Promise.all(defs.map((d) => lookup(d, m.rule)));
  const found = outcomes.find((o) => typeof o === "object");
  if (found && typeof found === "object") {
    displayName = found.name;
    expected = found.expected || undefined;
  }
  if (outcomes.every((o) => o === "missing")) missing.push(defs.join(" / "));
  if (outcomes.every((o) => o === "badOption" || o === "missing") && outcomes.includes("badOption")) {
    return { review: "the expected option does not exist in this tenant's settings catalog", labels };
  }
  if (m.rule.t === "all") {
    const kids = await mapLimit(m.rule.children, 4, async (c) => ({ c, o: await lookup(c.def, c.rule) }));
    for (const k of kids) if (k.o === "missing" || k.o === "badOption") missing.push(k.c.label);
  }
  return {
    review: missing.length ? `not found in this tenant's settings catalog: ${missing.join(", ")}` : null,
    displayName,
    labels,
    expected,
  };
}

// ─── Evaluators ───────────────────────────────────────────────────────────────

const windowsCheck: Check = async (ctx, id, expected) => {
  const m = BY_ID.get(id)!;
  const inv = await windowsInventory(ctx);
  if (!inv.ok) return fetchFailure(id, expected, inv);
  const scope = await windowsScope(ctx);
  if (!scope.ok) return fetchFailure(id, expected, scope);

  const v = await verifyMapping(ctx, m);
  const exp = v.expected ?? expected;
  const intuneName = v.displayName ? `Intune setting “${v.displayName}”. ` : "";
  if (v.review) {
    return result(id, exp, "Manual", "unknown", `${intuneName}Mapping needs review — ${v.review}. Verify this setting manually.`,
      defsOf(m).map((d) => ({ source: catalogPath(d), path: "", value: "not verified" })));
  }

  const ev = evaluateSetting(m, { policies: inv.policies, legacy: inv.legacy, scope: scope.scope, labels: v.labels });
  const evidence: Evidence[] = ev.policies.map((p) => ({
    source: `/beta/deviceManagement/configurationPolicies('${p.id}')`,
    path: `${p.name} (${p.family}) · ${defsOf(m)[0]}`,
    value: p.value,
  }));
  return result(id, exp, ev.state, ev.actual, intuneName + ev.message, evidence, ev.table);
};

export const WINDOWS_EVALUATORS: Record<string, Check> = Object.fromEntries(WINDOWS_CHECKS.map((c) => [c.id, windowsCheck]));

/** Short inventory summary for the activity feed. */
export async function windowsInventorySummary(ctx: CheckContext): Promise<{ ok: boolean; text: string; warnings: string[] }> {
  const inv = await windowsInventory(ctx);
  if (!inv.ok) return { ok: false, text: inv.error, warnings: [] };
  const assigned = inv.policies.filter(isAssigned).length;
  const legacyAssigned = inv.legacy.filter(isAssigned).length;
  return {
    ok: true,
    text: `${inv.policies.length} Windows settings catalog / endpoint security policies, ${assigned} assigned; ${legacyAssigned} assigned legacy profiles (not inspected)`,
    warnings: inv.warnings,
  };
}
