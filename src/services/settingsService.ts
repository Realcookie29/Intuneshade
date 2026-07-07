import { graphGetAll } from "./graphClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PolicySetting {
  settingDefinitionId: string;
  rawValue: string;
}

interface RawSettingInstance {
  "@odata.type": string;
  settingDefinitionId: string;
  choiceSettingValue?: { value: string };
  simpleSettingValue?: { value: unknown };
}

interface RawSetting {
  id: string;
  settingInstance: RawSettingInstance;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractValue(inst: RawSettingInstance): string {
  if (inst.choiceSettingValue?.value) {
    // Strip the long settingDefinitionId prefix from choice values
    // e.g. "device_vendor_msft_bitlocker_requiredeviceencryption_1" → "1"
    const v = inst.choiceSettingValue.value;
    const base = inst.settingDefinitionId;
    if (v.startsWith(base + "_")) return v.slice(base.length + 1);
    const parts = v.split("_");
    return parts[parts.length - 1];
  }
  if (inst.simpleSettingValue?.value !== undefined) {
    return String(inst.simpleSettingValue.value);
  }
  return "";
}

export function formatSettingName(settingDefinitionId: string): string {
  // Strip known vendor prefixes
  const cleaned = settingDefinitionId
    .replace(/^(device|user)_vendor_msft_policy_config_[^_]+_/i, "")
    .replace(/^(device|user)_vendor_msft_[^_]+_/i, "")
    .replace(/_/g, " ");

  return cleaned
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim() || settingDefinitionId;
}

// Fields that are metadata, not settings — excluded from conflict comparison
const DEVICE_CONFIG_METADATA_FIELDS = new Set([
  "id", "displayName", "description", "createdDateTime", "lastModifiedDateTime",
  "version", "supportsScopeTags", "roleScopeTagIds", "assignments",
  "@odata.type", "@odata.context", "deviceManagementApplicabilityRuleOsEdition",
  "deviceManagementApplicabilityRuleOsVersion", "deviceManagementApplicabilityRuleDeviceMode",
  "isAssigned",
]);

/**
 * Extracts comparable settings from a deviceConfigurations policy object.
 * Settings are embedded directly in the policy JSON (not a separate /settings endpoint).
 * We exclude metadata fields and keep only primitive-valued settings.
 */
export function extractDeviceConfigSettings(
  policy: Record<string, unknown>
): PolicySetting[] {
  const results: PolicySetting[] = [];
  for (const [key, value] of Object.entries(policy)) {
    if (DEVICE_CONFIG_METADATA_FIELDS.has(key)) continue;
    if (value === null || value === undefined) continue;
    // Only compare primitive settings (string, number, boolean)
    if (typeof value === "object") continue;
    results.push({
      settingDefinitionId: key,
      rawValue: String(value),
    });
  }
  return results;
}

export function formatDeviceConfigSettingName(key: string): string {
  // Convert camelCase to Title Case words
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchConfigPolicySettings(policyId: string): Promise<PolicySetting[]> {
  try {
    const settings = await graphGetAll<RawSetting>(
      `/deviceManagement/configurationPolicies('${policyId}')/settings`
    );
    return settings
      .map((s) => ({
        settingDefinitionId: s.settingInstance.settingDefinitionId,
        rawValue: extractValue(s.settingInstance),
      }))
      .filter((s) => s.rawValue !== "");
  } catch {
    return [];
  }
}

export async function fetchDeviceConfigDetails(policyId: string): Promise<PolicySetting[]> {
  try {
    const { graphGet } = await import("./graphClient");
    const policy = await graphGet<Record<string, unknown>>(
      `/deviceManagement/deviceConfigurations/${policyId}`
    );
    return extractDeviceConfigSettings(policy);
  } catch {
    return [];
  }
}
