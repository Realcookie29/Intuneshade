import { graphGetAll } from "./graphClient";

/** The compliance buckets we roll Graph's complianceState values into. */
export type ComplianceBucket = "compliant" | "noncompliant" | "inGracePeriod" | "error" | "conflict" | "unknown";

export const BUCKET_LABEL: Record<ComplianceBucket, string> = {
  compliant: "Compliant",
  noncompliant: "Not compliant",
  inGracePeriod: "In grace period",
  error: "Error",
  conflict: "Conflict",
  unknown: "Unknown / not evaluated",
};

/** Mission-Control colours per bucket (used by the donut and legend). */
export const BUCKET_COLOR: Record<ComplianceBucket, string> = {
  compliant: "#3DDC97",
  noncompliant: "#FF5C6C",
  inGracePeriod: "#FFB020",
  error: "#FF8A3D",
  conflict: "#B39DDB",
  unknown: "#6B7386",
};

/** Fixed display order for buckets, shared by the page and the HTML report. */
export const BUCKET_ORDER_HELPER: ComplianceBucket[] = ["compliant", "noncompliant", "inGracePeriod", "error", "conflict", "unknown"];

export function bucketOf(state: string): ComplianceBucket {
  switch (state) {
    case "compliant": return "compliant";
    case "noncompliant": return "noncompliant";
    case "inGracePeriod": return "inGracePeriod";
    case "error": return "error";
    case "conflict": return "conflict";
    default: return "unknown"; // unknown, configManager, notApplicable, …
  }
}

export interface ManagedDeviceLite {
  id: string;
  deviceName: string;
  complianceState: string;
  bucket: ComplianceBucket;
  operatingSystem: string;
  osVersion: string;
  userPrincipalName: string;
  lastSyncDateTime: string;
  model: string;
  manufacturer: string;
}

const DEVICE_SELECT =
  "id,deviceName,complianceState,operatingSystem,osVersion,userPrincipalName,lastSyncDateTime,model,manufacturer";

/** Fetch every managed device (paginated) with just the fields we render. */
export async function fetchManagedDevices(): Promise<ManagedDeviceLite[]> {
  const raw = await graphGetAll<Record<string, unknown>>(
    `/deviceManagement/managedDevices?$select=${DEVICE_SELECT}`
  );
  return raw.map((d) => {
    const complianceState = (d.complianceState as string) ?? "unknown";
    return {
      id: (d.id as string) ?? "",
      deviceName: (d.deviceName as string) ?? "(unnamed)",
      complianceState,
      bucket: bucketOf(complianceState),
      operatingSystem: (d.operatingSystem as string) ?? "",
      osVersion: (d.osVersion as string) ?? "",
      userPrincipalName: (d.userPrincipalName as string) ?? "",
      lastSyncDateTime: (d.lastSyncDateTime as string) ?? "",
      model: (d.model as string) ?? "",
      manufacturer: (d.manufacturer as string) ?? "",
    };
  });
}

export interface ComplianceReason {
  settingName: string;
  nonCompliant: number;
  compliant: number;
  error: number;
  conflict: number;
  remediated: number;
}

/**
 * Tenant-wide summary of which compliance *settings* devices fail — this is the
 * "reasons" overview. Returns settings with at least one non-compliant device,
 * most-failed first.
 */
export async function fetchComplianceReasons(): Promise<ComplianceReason[]> {
  const raw = await graphGetAll<Record<string, unknown>>(
    "/deviceManagement/deviceCompliancePolicySettingStateSummaries"
  );
  return raw
    .map((s) => ({
      settingName: (s.settingName as string) ?? (s.setting as string) ?? "(unknown setting)",
      nonCompliant: (s.nonCompliantDeviceCount as number) ?? 0,
      compliant: (s.compliantDeviceCount as number) ?? 0,
      error: (s.errorDeviceCount as number) ?? 0,
      conflict: (s.conflictDeviceCount as number) ?? 0,
      remediated: (s.remediatedDeviceCount as number) ?? 0,
    }))
    .filter((s) => s.nonCompliant + s.error + s.conflict > 0)
    .sort((a, b) => b.nonCompliant - a.nonCompliant);
}

export interface DevicePolicyState {
  id: string;
  policyName: string;
  state: string;
}
export interface DeviceSettingState {
  setting: string;
  state: string;
}
export interface DeviceComplianceDetail {
  policies: DevicePolicyState[];
  failingSettings: DeviceSettingState[];
}

/**
 * Per-device drill-down: which compliance policies apply and their state, plus
 * the individual settings that are failing on the non-compliant policies.
 */
export async function fetchDeviceComplianceDetail(deviceId: string): Promise<DeviceComplianceDetail> {
  const rawPolicies = await graphGetAll<Record<string, unknown>>(
    `/deviceManagement/managedDevices/${deviceId}/deviceCompliancePolicyStates`
  );
  const policies: DevicePolicyState[] = rawPolicies.map((p) => ({
    id: (p.id as string) ?? "",
    policyName: (p.displayName as string) ?? "(policy)",
    state: (p.state as string) ?? "unknown",
  }));

  const failingSettings: DeviceSettingState[] = [];
  for (const p of policies) {
    if (p.state === "compliant" || p.state === "unknown" || !p.id) continue;
    try {
      const rawSettings = await graphGetAll<Record<string, unknown>>(
        `/deviceManagement/managedDevices/${deviceId}/deviceCompliancePolicyStates/${p.id}/settingStates`
      );
      for (const s of rawSettings) {
        const state = (s.state as string) ?? "";
        if (state && state !== "compliant" && state !== "notApplicable") {
          failingSettings.push({
            setting: (s.settingName as string) ?? (s.setting as string) ?? "(setting)",
            state,
          });
        }
      }
    } catch { /* skip a policy whose settings can't be read */ }
  }

  return { policies, failingSettings };
}
