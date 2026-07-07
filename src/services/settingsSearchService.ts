import { graphGetAll } from "./graphClient";
import { fetchPolicies } from "./policiesService";
import { POLICY_DEFINITIONS } from "../utils/policyConfig";
import { getGroupMap } from "../hooks/useGroups";
import { normalizeGroupDisplayName, getAssignmentTypeLabel } from "../utils/assignmentHelpers";
import type { PolicyType, GraphAssignmentRaw } from "../types/policyTypes";

// ─── Result types ─────────────────────────────────────────────────────────────

export interface SettingMatch {
  name: string;
  value: string;
  rawId?: string;
}

export interface AssignmentInfo {
  groupName: string;
  assignmentType: "Include" | "Exclude" | "All Users" | "All Devices";
}

export interface PolicySearchResult {
  policyId: string;
  policyName: string;
  policyDescription: string;
  policyType: PolicyType;
  matches: SettingMatch[];
  assignments: AssignmentInfo[];
}

function extractAssignments(rawAssignments: GraphAssignmentRaw[] | undefined): AssignmentInfo[] {
  if (!rawAssignments?.length) return [];
  const gMap = getGroupMap();
  const results: AssignmentInfo[] = [];
  for (const a of rawAssignments) {
    const t = getAssignmentTypeLabel(a.target);
    if (t === "No Assignment") continue;
    results.push({
      groupName: normalizeGroupDisplayName(a.target, gMap),
      assignmentType: t,
    });
  }
  return results;
}

// ─── Settings Catalog (configurationPolicies) ─────────────────────────────────

interface SettingInstance {
  "@odata.type"?: string;
  settingDefinitionId?: string;
  simpleSettingValue?: { value: unknown };
  choiceSettingValue?: { value?: string; children?: SettingInstance[] };
  simpleSettingCollectionValue?: Array<{ value: unknown }>;
  groupSettingValue?: { children?: SettingInstance[] };
  groupSettingCollectionValue?: Array<{ children?: SettingInstance[] }>;
  settingGroupCollectionValue?: Array<{ children?: SettingInstance[] }>;
  choiceSettingCollectionValue?: Array<{ value?: string; children?: SettingInstance[] }>;
}

interface CatalogSettingRow {
  settingInstance: SettingInstance;
}

function formatDefinitionId(id: string): string {
  // Strip common prefixes, show last meaningful parts
  const parts = id.split("_");
  // Remove leading common tokens: device/user, vendor, msft
  const stripped = parts.filter((p, i) => {
    if (i === 0 && (p === "device" || p === "user")) return false;
    if (i === 1 && p === "vendor") return false;
    if (i === 2 && p === "msft") return false;
    return true;
  });
  // Capitalize and join
  return stripped
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function extractSettingValue(instance: SettingInstance): string {
  if (instance.simpleSettingValue !== undefined) {
    return String(instance.simpleSettingValue.value ?? "");
  }
  if (instance.choiceSettingValue?.value) {
    // The value is like "..._enabled" or "..._3" — take the last segment
    const parts = instance.choiceSettingValue.value.split("_");
    return parts[parts.length - 1] ?? instance.choiceSettingValue.value;
  }
  if (instance.simpleSettingCollectionValue) {
    return instance.simpleSettingCollectionValue
      .map((v) => String(v.value ?? ""))
      .join(", ");
  }
  return "";
}

function walkSettingInstance(
  instance: SettingInstance,
  query: string,
  matches: SettingMatch[]
): void {
  const id = instance.settingDefinitionId ?? "";
  const idFlat = id.replace(/_/g, " ").toLowerCase();

  if (id && idFlat.includes(query)) {
    matches.push({
      name: formatDefinitionId(id),
      value: extractSettingValue(instance),
      rawId: id,
    });
  }

  // Recurse into children
  const children: SettingInstance[] = [
    ...(instance.choiceSettingValue?.children ?? []),
    ...(instance.groupSettingValue?.children ?? []),
    ...(instance.groupSettingCollectionValue?.flatMap((g) => g.children ?? []) ?? []),
    ...(instance.settingGroupCollectionValue?.flatMap((g) => g.children ?? []) ?? []),
    ...(instance.choiceSettingCollectionValue?.flatMap((g) => g.children ?? []) ?? []),
  ];
  for (const child of children) {
    walkSettingInstance(child, query, matches);
  }
}

async function searchCatalogPolicy(
  policyId: string,
  query: string
): Promise<SettingMatch[]> {
  try {
    const rows = await graphGetAll<CatalogSettingRow>(
      `/deviceManagement/configurationPolicies('${policyId}')/settings`
    );
    const matches: SettingMatch[] = [];
    for (const row of rows) {
      if (row.settingInstance) {
        walkSettingInstance(row.settingInstance, query, matches);
      }
    }
    return matches;
  } catch {
    return [];
  }
}

// ─── Admin Templates (groupPolicyConfigurations) ──────────────────────────────

interface DefinitionValue {
  enabled?: boolean;
  definition?: {
    displayName?: string;
    categoryPath?: string;
  };
  presentationValues?: Array<{
    value?: unknown;
    presentation?: { label?: string };
  }>;
}

async function searchAdminTemplatePolicy(
  policyId: string,
  query: string
): Promise<SettingMatch[]> {
  try {
    const values = await graphGetAll<DefinitionValue>(
      `/deviceManagement/groupPolicyConfigurations/${policyId}/definitionValues?$expand=definition,presentationValues($expand=presentation)`
    );
    const matches: SettingMatch[] = [];
    for (const dv of values) {
      const name = dv.definition?.displayName ?? "";
      const category = dv.definition?.categoryPath ?? "";
      const combined = `${name} ${category}`.toLowerCase();
      if (combined.includes(query)) {
        const valueStr = dv.presentationValues?.length
          ? dv.presentationValues
              .map((pv) => {
                const label = pv.presentation?.label ?? "";
                const val = String(pv.value ?? "");
                return label ? `${label}: ${val}` : val;
              })
              .filter(Boolean)
              .join(", ")
          : dv.enabled !== undefined
          ? dv.enabled ? "Enabled" : "Disabled"
          : "";
        matches.push({ name, value: valueStr });
      }
    }
    return matches;
  } catch {
    return [];
  }
}

// ─── Generic JSON search (deviceConfigurations, compliancePolicies, etc.) ─────

const SKIP_KEYS = new Set([
  "id", "createdDateTime", "lastModifiedDateTime", "version",
  "assignments", "scheduledActionsForRule", "deviceStatuses",
  "userStatuses", "deviceStatusOverview", "isAssigned",
  "settingCount", "roleScopeTagIds", "deviceSettingStateSummaries",
]);

function camelToWords(str: string): string {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function flattenAndSearch(
  obj: Record<string, unknown>,
  query: string,
  matches: SettingMatch[],
  depth = 0
): void {
  if (depth > 4) return;
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key) || key.startsWith("@")) continue;
    if (value === null || value === undefined) continue;

    if (typeof value === "object" && !Array.isArray(value)) {
      flattenAndSearch(value as Record<string, unknown>, query, matches, depth + 1);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          flattenAndSearch(item as Record<string, unknown>, query, matches, depth + 1);
        }
      }
    } else {
      const strKey = camelToWords(key).toLowerCase();
      const strVal = String(value).toLowerCase();
      if (strKey.includes(query) || strVal.includes(query)) {
        matches.push({
          name: camelToWords(key),
          value: String(value).slice(0, 250),
        });
      }
    }
  }
}

// ─── Intents settings ────────────────────────────────────────────────────────

interface IntentSetting {
  definitionId?: string;
  value?: unknown;
  valueJson?: string;
}

async function searchIntentPolicy(
  policyId: string,
  query: string
): Promise<SettingMatch[]> {
  try {
    const settings = await graphGetAll<IntentSetting>(
      `/deviceManagement/intents/${policyId}/settings`
    );
    const matches: SettingMatch[] = [];
    for (const s of settings) {
      const id = s.definitionId ?? "";
      const idFlat = id.replace(/_/g, " ").replace(/[A-Z]/g, " $&").toLowerCase();
      if (idFlat.includes(query)) {
        const val = s.value !== undefined
          ? String(s.value)
          : s.valueJson ?? "";
        matches.push({ name: camelToWords(id.split("_").pop() ?? id), value: val });
      }
    }
    return matches;
  } catch {
    return [];
  }
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Main search entry point ──────────────────────────────────────────────────

export async function searchPolicySettings(
  rawQuery: string,
  onProgress: (pct: number, phase: string) => void
): Promise<PolicySearchResult[]> {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const results: PolicySearchResult[] = [];
  const total = POLICY_DEFINITIONS.length;

  for (let i = 0; i < total; i++) {
    const def = POLICY_DEFINITIONS[i];
    onProgress(Math.round((i / total) * 100), `Scanning ${def.label}…`);

    try {
      const policies = await fetchPolicies(def.type);

      if (def.type === "configurationPolicies") {
        // Settings Catalog: fetch settings per policy in batches
        const matchArrays = await runInBatches(policies, 6, (p) =>
          searchCatalogPolicy(p.id, query)
        );
        for (let j = 0; j < policies.length; j++) {
          const p = policies[j];
          const matches = matchArrays[j];
          const name = p.displayName ?? p.name ?? "";
          // Also check policy name/description
          const nameLower = name.toLowerCase();
          const descLower = (p.description ?? "").toLowerCase();
          if (matches.length > 0 || nameLower.includes(query) || descLower.includes(query)) {
            results.push({
              policyId: p.id,
              policyName: name,
              policyDescription: p.description ?? "",
              policyType: def.type,
              matches,
              assignments: extractAssignments(p.assignments),
            });
          }
        }
      } else if (def.type === "groupPolicyConfigurations") {
        // Admin Templates: fetch definition values per policy
        const matchArrays = await runInBatches(policies, 4, (p) =>
          searchAdminTemplatePolicy(p.id, query)
        );
        for (let j = 0; j < policies.length; j++) {
          const p = policies[j];
          const matches = matchArrays[j];
          const name = p.displayName ?? p.name ?? "";
          const nameLower = name.toLowerCase();
          if (matches.length > 0 || nameLower.includes(query)) {
            results.push({
              policyId: p.id,
              policyName: name,
              policyDescription: p.description ?? "",
              policyType: def.type,
              matches,
              assignments: extractAssignments(p.assignments),
            });
          }
        }
      } else if (def.type === "deviceManagementIntents") {
        // Intents: fetch settings per policy
        const matchArrays = await runInBatches(policies, 4, (p) =>
          searchIntentPolicy(p.id, query)
        );
        for (let j = 0; j < policies.length; j++) {
          const p = policies[j];
          const matches = matchArrays[j];
          const name = p.displayName ?? p.name ?? "";
          const nameLower = name.toLowerCase();
          if (matches.length > 0 || nameLower.includes(query)) {
            results.push({
              policyId: p.id,
              policyName: name,
              policyDescription: p.description ?? "",
              policyType: def.type,
              matches,
              assignments: extractAssignments(p.assignments),
            });
          }
        }
      } else {
        // Generic: search through the full JSON object returned by Graph
        for (const p of policies) {
          const name = p.displayName ?? p.name ?? "";
          const matches: SettingMatch[] = [];
          // The policy object from fetchPolicies already contains all settings
          flattenAndSearch(p as unknown as Record<string, unknown>, query, matches);
          const nameLower = name.toLowerCase();
          const descLower = (p.description ?? "").toLowerCase();
          if (matches.length > 0 || nameLower.includes(query) || descLower.includes(query)) {
            results.push({
              policyId: p.id,
              policyName: name,
              policyDescription: p.description ?? "",
              policyType: def.type,
              matches,
              assignments: extractAssignments(p.assignments),
            });
          }
        }
      }
    } catch {
      // skip failing types
    }
  }

  onProgress(100, "");
  return results;
}
