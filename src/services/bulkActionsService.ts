import { graphGet, graphPostWithResponse, graphPatch, graphDelete } from "./graphClient";
import type { PolicyType } from "../types/policyTypes";
import { getPolicyDefinition, POLICY_DEFINITIONS } from "../utils/policyConfig";
import { fetchPolicies } from "./policiesService";
import { getGroupMap, getFilterMap } from "../hooks/useGroups";

/**
 * Scan exported policies' assignments and return the group/filter id → name
 * pairs they reference (resolved from the loaded caches). Embedding these in the
 * export lets the offline JSON explorer show names instead of bare IDs.
 */
function collectAssignmentNames(policies: ExportedPolicy[]): {
  groups: { id: string; displayName: string }[];
  filters: { id: string; displayName: string }[];
} {
  const gMap = getGroupMap();
  const fMap = getFilterMap();
  const groups = new Map<string, string>();
  const filters = new Map<string, string>();
  for (const p of policies) {
    const asg = (p.assignments as { target?: Record<string, unknown> }[] | undefined) ?? [];
    for (const a of asg) {
      const gid = a.target?.groupId as string | undefined;
      if (gid) groups.set(gid, gMap.get(gid) ?? gid);
      const fid = a.target?.deviceAndAppManagementAssignmentFilterId as string | undefined;
      if (fid) filters.set(fid, fMap.get(fid) ?? fid);
    }
  }
  return {
    groups: [...groups].map(([id, displayName]) => ({ id, displayName })),
    filters: [...filters].map(([id, displayName]) => ({ id, displayName })),
  };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Fields that identify/timestamp a policy — stripped when cloning or exporting */
const STRIP_FIELDS = new Set([
  "id", "createdDateTime", "lastModifiedDateTime", "version",
  "isAssigned", "assignments", "@odata.context",
]);

/** Additional fields stripped on cross-tenant import (tenant-specific) */
const STRIP_FOR_IMPORT = new Set([
  ...STRIP_FIELDS,
  "roleScopeTagIds",
  "_policyType",
  "_exportedBy",
  "_exportedAt",
]);

function fetchFullPolicy(type: PolicyType, policyId: string): Promise<Record<string, unknown>> {
  if (type === "configurationPolicies") {
    // Settings Catalog: expand settings inline so they're included in the export/clone body
    return graphGet<Record<string, unknown>>(
      `/deviceManagement/configurationPolicies/${policyId}?$expand=settings`
    );
  }
  // Security baselines / intents live under /deviceManagement/intents, not the type name
  if (type === "deviceManagementIntents") {
    return graphGet<Record<string, unknown>>(`/deviceManagement/intents/${policyId}`);
  }
  const def = getPolicyDefinition(type);
  return graphGet<Record<string, unknown>>(`/${def.namespace}/${type}/${policyId}`);
}

/** Human-readable name of an exported/full policy object. */
export function policyDisplayName(p: Record<string, unknown>): string {
  return (
    (p.displayName as string | undefined) ??
    (p.name as string | undefined) ??
    "Unnamed policy"
  );
}

function stripFields(
  policy: Record<string, unknown>,
  strip: Set<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(policy)) {
    if (!strip.has(k)) result[k] = v;
  }
  return result;
}

// ─── Clone ────────────────────────────────────────────────────────────────────

/**
 * Clone a policy by fetching its full content (incl. settings for Settings
 * Catalog) and POSTing a new copy with a different name.
 * Returns the new policy id.
 */
export async function clonePolicy(
  type: PolicyType,
  policyId: string,
  newName: string
): Promise<string> {
  const policy = await fetchFullPolicy(type, policyId);
  const body = stripFields(policy, STRIP_FIELDS);
  body.displayName = newName;
  if ("name" in policy) body.name = newName;

  const def = getPolicyDefinition(type);
  const created = await graphPostWithResponse<{ id: string }>(
    `/${def.namespace}/${type}`,
    body
  );
  return created.id;
}

// ─── Enable / Disable ─────────────────────────────────────────────────────────

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Permanently delete policies from the tenant.
 * deviceManagementIntents uses a different path segment ("intents").
 */
export async function deletePolicies(
  type: PolicyType,
  policyIds: string[]
): Promise<void> {
  for (const id of policyIds) {
    const def = getPolicyDefinition(type);
    const path = type === "deviceManagementIntents"
      ? `/deviceManagement/intents/${id}`
      : `/${def.namespace}/${type}/${id}`;
    await graphDelete(path);
  }
}

// ─── Enable / Disable ─────────────────────────────────────────────────────────

/** Enable or disable Settings Catalog policies (configurationPolicies only). */
export async function setPoliciesEnabled(
  policyIds: string[],
  enabled: boolean
): Promise<void> {
  for (const id of policyIds) {
    await graphPatch(`/deviceManagement/configurationPolicies/${id}`, { isEnabled: enabled });
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export interface ExportedPolicy extends Record<string, unknown> {
  _policyType: PolicyType;
}

/**
 * Fetch the full content of each selected policy from Graph and download as
 * an Intune-compatible JSON file. The file can be re-imported with importPolicy().
 */
export async function exportPoliciesToJson(
  type: PolicyType,
  policies: Array<{ id: string; name: string }>
): Promise<void> {
  const exported: ExportedPolicy[] = [];

  // Assignments aren't part of the full-policy body, so pull them from the
  // list endpoint (which expands assignments) and re-attach by id.
  const withAssignments = await fetchPolicies(type);
  const asgById = new Map(
    withAssignments.map((p) => [p.id, p.assignments ?? []])
  );

  for (const policy of policies) {
    const full = await fetchFullPolicy(type, policy.id);
    const stripped = stripFields(full, STRIP_FIELDS) as ExportedPolicy;
    stripped._policyType = type;
    stripped.assignments = asgById.get(policy.id) ?? [];
    exported.push(stripped);
  }

  const { groups, filters } = collectAssignmentNames(exported);
  const payload = JSON.stringify(
    {
      _exportedBy: "IntuneShade",
      _exportedAt: new Date().toISOString(),
      _version: 1,
      groups,
      filters,
      policies: exported,
    },
    null,
    2
  );

  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intune-${type}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Import ───────────────────────────────────────────────────────────────────

export interface ImportResult {
  name: string;
  id: string;
}

/**
 * Parse a JSON file exported by exportPoliciesToJson.
 * Returns the list of policies ready to import.
 */
export function parseImportFile(json: string): ExportedPolicy[] {
  const data = JSON.parse(json) as { policies?: ExportedPolicy[] };
  if (!data.policies || !Array.isArray(data.policies)) {
    throw new Error("Invalid export file: missing 'policies' array.");
  }
  return data.policies;
}

/**
 * Import a single exported policy into the current tenant.
 * Returns the new policy id.
 */
export async function importPolicy(policy: ExportedPolicy): Promise<string> {
  const type = policy._policyType;
  if (!type) throw new Error("Policy is missing _policyType field.");
  const def = getPolicyDefinition(type);

  const body = stripFields(policy as Record<string, unknown>, STRIP_FOR_IMPORT);

  const created = await graphPostWithResponse<{ id: string }>(
    `/${def.namespace}/${type}`,
    body
  );
  return created.id;
}

// ─── Tenant-wide Backup & Restore ──────────────────────────────────────────────

export interface BackupResult {
  policies: ExportedPolicy[];
  payload: string;
}

/**
 * Backs up the full content of every policy across all policy types into a
 * single JSON payload that can be restored with importPolicy().
 */
export async function backupAllPolicies(
  onProgress?: (done: number, total: number, label: string, count: number) => void
): Promise<BackupResult> {
  const exported: ExportedPolicy[] = [];

  for (let i = 0; i < POLICY_DEFINITIONS.length; i++) {
    const def = POLICY_DEFINITIONS[i];
    onProgress?.(i, POLICY_DEFINITIONS.length, def.label, exported.length);
    try {
      const list = await fetchPolicies(def.type);
      for (const p of list) {
        try {
          const full = await fetchFullPolicy(def.type, p.id);
          const stripped = stripFields(full, STRIP_FIELDS) as ExportedPolicy;
          stripped._policyType = def.type;
          // Re-attach assignments (stripped from the body) so the backup is
          // assignment-aware and works in the offline JSON explorer. Restore
          // strips them again via STRIP_FOR_IMPORT, so this is safe.
          stripped.assignments = p.assignments ?? [];
          exported.push(stripped);
        } catch {
          /* skip individual policy that fails to fetch */
        }
      }
    } catch {
      /* skip a whole type that fails */
    }
  }
  onProgress?.(POLICY_DEFINITIONS.length, POLICY_DEFINITIONS.length, "", exported.length);

  const { groups, filters } = collectAssignmentNames(exported);
  const payload = JSON.stringify(
    {
      _exportedBy: "IntuneShade",
      _exportedAt: new Date().toISOString(),
      _version: 1,
      _kind: "full-backup",
      groups,
      filters,
      policies: exported,
    },
    null,
    2
  );

  return { policies: exported, payload };
}

/** Triggers a browser download of a backup payload. */
export function downloadBackup(payload: string, filename?: string): void {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `intune-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
