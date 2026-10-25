// ─── Collector agent ──────────────────────────────────────────────────────────
// Reads everything the baseline needs from Microsoft Graph. Read-only, no AI.
// Each source is collected independently: one failing source (missing licence,
// missing consent) marks only its controls as "error" instead of aborting.

import { graphGet, graphGetAll } from "../graphClient";
import { BASELINE_SCOPES } from "../../auth/msalConfig";
import { ROLE_GLOBAL_ADMIN } from "../../baseline/evaluators";
import type { SourceKey, SourceResult, TenantSnapshot } from "../../baseline/types";

interface SourceDef {
  key: SourceKey;
  label: string;
  endpoint: string;
  fetch: () => Promise<unknown>;
}

const S = BASELINE_SCOPES;

/** Some beta policy endpoints return a collection instead of a single object. */
function single<T>(res: unknown): T {
  const r = res as { value?: T[] };
  return (Array.isArray(r?.value) ? r.value[0] : res) as T;
}

const SOURCES: SourceDef[] = [
  {
    key: "caPolicies",
    label: "Conditional Access policies",
    endpoint: "/identity/conditionalAccess/policies",
    fetch: () => graphGetAll("/identity/conditionalAccess/policies", S),
  },
  {
    key: "securityDefaults",
    label: "Security defaults",
    endpoint: "/policies/identitySecurityDefaultsEnforcementPolicy",
    fetch: () => graphGet("/policies/identitySecurityDefaultsEnforcementPolicy", S),
  },
  {
    key: "authorizationPolicy",
    label: "Authorization policy",
    endpoint: "/policies/authorizationPolicy",
    fetch: async () => single(await graphGet("/policies/authorizationPolicy", S)),
  },
  {
    key: "authMethodsPolicy",
    label: "Authentication methods policy",
    endpoint: "/policies/authenticationMethodsPolicy",
    fetch: () => graphGet("/policies/authenticationMethodsPolicy", S),
  },
  {
    key: "globalAdmins",
    label: "Global Administrators",
    endpoint: `/directoryRoles(roleTemplateId='${ROLE_GLOBAL_ADMIN}')/members`,
    fetch: () =>
      graphGetAll(`/directoryRoles(roleTemplateId='${ROLE_GLOBAL_ADMIN}')/members?$select=id,displayName`, S),
  },
  {
    key: "configurationPolicies",
    label: "Settings Catalog & endpoint security policies",
    endpoint: "/deviceManagement/configurationPolicies",
    fetch: () => graphGetAll("/deviceManagement/configurationPolicies", S),
  },
  {
    key: "deviceConfigurations",
    label: "Device configuration profiles",
    endpoint: "/deviceManagement/deviceConfigurations",
    fetch: () => graphGetAll("/deviceManagement/deviceConfigurations?$expand=assignments", S),
  },
  {
    key: "compliancePolicies",
    label: "Compliance policies",
    endpoint: "/deviceManagement/deviceCompliancePolicies",
    fetch: () => graphGetAll("/deviceManagement/deviceCompliancePolicies?$expand=assignments", S),
  },
  {
    key: "deviceManagementSettings",
    label: "Intune compliance settings",
    endpoint: "/deviceManagement?$select=settings",
    fetch: async () => (await graphGet<{ settings?: unknown }>("/deviceManagement?$select=settings", S)).settings,
  },
  {
    key: "complianceSummary",
    label: "Device compliance summary",
    endpoint: "/deviceManagement/deviceCompliancePolicyDeviceStateSummary",
    fetch: () => graphGet("/deviceManagement/deviceCompliancePolicyDeviceStateSummary", S),
  },
];

export interface CollectorHooks {
  onSource: (index: number, total: number, label: string, endpoint: string) => void;
  onSourceDone: (label: string, result: SourceResult) => void;
  signal?: AbortSignal;
}

/** Returns the Graph error in one short line (status + message), without tokens or bodies. */
function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const status = msg.match(/→ (\d{3})/)?.[1];
  const inner = msg.match(/"message"\s*:\s*"([^"]{1,160})/)?.[1];
  if (status === "403") return "403 Forbidden — missing permission or licence";
  return [status, inner ?? msg.slice(0, 160)].filter(Boolean).join(" — ");
}

export async function collectSnapshot(hooks: CollectorHooks): Promise<TenantSnapshot> {
  const snapshot: TenantSnapshot = { collectedAt: new Date().toISOString() };
  for (const [i, src] of SOURCES.entries()) {
    if (hooks.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    hooks.onSource(i, SOURCES.length, src.label, src.endpoint);
    let result: SourceResult;
    try {
      result = { ok: true, endpoint: src.endpoint, data: await src.fetch() };
    } catch (err) {
      result = { ok: false, endpoint: src.endpoint, error: shortError(err) };
    }
    snapshot[src.key] = result;
    hooks.onSourceDone(src.label, result);
  }
  return snapshot;
}

/** Item count of a source, for the activity feed. */
export function sourceSize(result: SourceResult): number | null {
  return Array.isArray(result.data) ? result.data.length : null;
}
