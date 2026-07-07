import { fetchPolicies } from "./policiesService";
import type { PolicyType } from "../types/policyTypes";
import { POLICY_DEFINITIONS } from "../utils/policyConfig";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PolicyTypeSummary {
  type: PolicyType;
  label: string;
  count: number;
  unassignedCount: number;
  allUsersCount: number;
  allDevicesCount: number;
  groupAssignedCount: number;
  exclusionCount: number;
}

export interface UnassignedPolicy {
  type: string;
  label: string;
  name: string;
}

export interface TenantSummary {
  scannedAt: string;
  totalPolicies: number;
  totalGroups: number;
  byType: PolicyTypeSummary[];
  unassignedPolicies: UnassignedPolicy[];
}

export interface ScanProgress {
  label: string;
  done: number;
  total: number;
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

const ALL_USERS_TYPE = "#microsoft.graph.allLicensedUsersAssignmentTarget";
const ALL_DEVICES_TYPE = "#microsoft.graph.allDevicesAssignmentTarget";
const EXCLUSION_TYPE = "#microsoft.graph.exclusionGroupAssignmentTarget";

export async function scanTenant(
  onProgress: (p: ScanProgress) => void
): Promise<TenantSummary> {
  const total = POLICY_DEFINITIONS.length;
  const byType: PolicyTypeSummary[] = [];
  const unassignedPolicies: UnassignedPolicy[] = [];
  let totalPolicies = 0;

  for (let i = 0; i < POLICY_DEFINITIONS.length; i++) {
    const def = POLICY_DEFINITIONS[i];
    onProgress({ label: def.label, done: i, total });

    let policies: Awaited<ReturnType<typeof fetchPolicies>> = [];
    try {
      policies = await fetchPolicies(def.type);
    } catch {
      // If a type fails (e.g. not licensed), skip it gracefully
      policies = [];
    }

    let unassigned = 0;
    let allUsers = 0;
    let allDevices = 0;
    let groupAssigned = 0;
    let exclusions = 0;

    for (const policy of policies) {
      const assignments = policy.assignments ?? [];
      if (assignments.length === 0) {
        unassigned++;
        const name = policy.displayName ?? policy.name ?? policy.id;
        unassignedPolicies.push({ type: def.type, label: def.label, name });
      } else {
        for (const a of assignments) {
          const targetType = a.target?.["@odata.type"] ?? "";
          if (targetType === ALL_USERS_TYPE) allUsers++;
          else if (targetType === ALL_DEVICES_TYPE) allDevices++;
          else if (targetType === EXCLUSION_TYPE) exclusions++;
          else groupAssigned++;
        }
      }
    }

    byType.push({
      type: def.type,
      label: def.label,
      count: policies.length,
      unassignedCount: unassigned,
      allUsersCount: allUsers,
      allDevicesCount: allDevices,
      groupAssignedCount: groupAssigned,
      exclusionCount: exclusions,
    });

    totalPolicies += policies.length;
  }

  onProgress({ label: "Done", done: total, total });

  return {
    scannedAt: new Date().toISOString(),
    totalPolicies,
    totalGroups: 0, // groups aren't needed for the report narrative
    byType,
    unassignedPolicies,
  };
}

// ─── API call ─────────────────────────────────────────────────────────────────

export interface ComplianceSection {
  title: string;
  content: string;
}

export interface ComplianceActionItem {
  priority: "high" | "medium" | "low";
  text: string;
}

export interface ComplianceReport {
  riskLevel: "low" | "medium" | "high" | "critical";
  executiveSummary: string;
  sections: ComplianceSection[];
  actionItems: ComplianceActionItem[];
}

export async function generateComplianceReport(
  summary: TenantSummary,
  apiKey: string
): Promise<ComplianceReport> {
  const provider = localStorage.getItem("intune_gm_ai_provider") ?? "anthropic";
  const azureRaw = localStorage.getItem("intune_gm_azure_config");
  const azure = azureRaw ? JSON.parse(azureRaw) as { endpoint: string; deployment: string } : null;
  const extra = azure ? { azureEndpoint: azure.endpoint, azureDeployment: azure.deployment } : {};
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({ mode: "compliance", provider, tenantSummary: summary, ...extra }),
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string") msg = j.error;
      else msg = `API error ${res.status}: ${text.slice(0, 200)}`;
    } catch {
      msg = `API error ${res.status}: ${text.slice(0, 200)}`;
    }
    throw new Error(msg);
  }

  try {
    return JSON.parse(text) as ComplianceReport;
  } catch {
    throw new Error(`Unexpected response format: ${text.slice(0, 200)}`);
  }
}
