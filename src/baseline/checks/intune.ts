// ─── Intune service settings (4.x) ────────────────────────────────────────────

import type { CheckContext } from "../context";
import { fetchFailure, result } from "../context";
import type { CheckResult, Evidence } from "../types";

type Check = (ctx: CheckContext, id: string, expected: string) => Promise<CheckResult>;

const DM_SETTINGS = "/beta/deviceManagement/settings";
const DM_SETTINGS_FALLBACK = "/beta/deviceManagement?$select=settings";
export const ENROLLMENT_CONFIGS = "/beta/deviceManagement/deviceEnrollmentConfigurations";
export const COMANAGED_PROBE = "/beta/deviceManagement/managedDevices?$filter=managementAgent eq 'configurationManagerClientMdm'&$top=1&$select=id";

/** True when at least one co-managed device exists; null when unknown. */
export async function isCoManaged(ctx: CheckContext): Promise<boolean | null> {
  const r = await ctx.get<{ value?: unknown[] }>(COMANAGED_PROBE);
  return r.ok ? (r.data.value?.length ?? 0) > 0 : null;
}

const secureByDefault: Check = async (ctx, id, expected) => {
  let r = await ctx.get<{ secureByDefault?: boolean; settings?: { secureByDefault?: boolean } }>(DM_SETTINGS);
  let source = DM_SETTINGS;
  if (!r.ok && (r.status === 400 || r.status === 404)) {
    r = await ctx.get(DM_SETTINGS_FALLBACK);
    source = DM_SETTINGS_FALLBACK;
  }
  if (!r.ok) return fetchFailure(id, expected, r, true);
  const value = r.data.secureByDefault ?? r.data.settings?.secureByDefault;
  const coManaged = await isCoManaged(ctx);
  const note = coManaged ? " Info: co-managed devices found — the compliance workload may be handled by ConfigMgr." : "";
  return result(id, expected, value === true ? "Pass" : "Fail", String(value),
    (value === true ? "Devices without a compliance policy are marked Not compliant." : "Devices without a compliance policy are treated as compliant.") + note,
    [{ source, path: "secureByDefault", value }]);
};

interface Restriction { platformBlocked?: boolean; personalDeviceEnrollmentBlocked?: boolean }
interface EnrollmentConfig {
  "@odata.type"?: string;
  displayName?: string;
  priority?: number;
  platformType?: string;
  platformRestriction?: Restriction;
  [platform: string]: unknown;
}

const PLATFORM_KEYS: Record<string, string> = {
  iosRestriction: "iOS/iPadOS",
  androidRestriction: "Android device administrator",
  androidForWorkRestriction: "Android Enterprise work profile",
  windowsRestriction: "Windows",
  windowsMobileRestriction: "Windows Mobile",
  macOSRestriction: "macOS",
};

/** Flattens both the legacy combined restriction and the per-platform variants into platform → restriction. */
function restrictionsOf(cfg: EnrollmentConfig): Array<[string, Restriction]> {
  if (cfg["@odata.type"] === "#microsoft.graph.deviceEnrollmentPlatformRestrictionsConfiguration") {
    return Object.entries(PLATFORM_KEYS)
      .filter(([k]) => cfg[k])
      .map(([k, name]) => [name, cfg[k] as Restriction]);
  }
  if (cfg["@odata.type"] === "#microsoft.graph.deviceEnrollmentPlatformRestrictionConfiguration" && cfg.platformRestriction) {
    return [[cfg.platformType ?? "platform", cfg.platformRestriction]];
  }
  return [];
}

const personalEnrollment: Check = async (ctx, id, expected) => {
  const r = await ctx.getAll<EnrollmentConfig>(ENROLLMENT_CONFIGS);
  if (!r.ok) return fetchFailure(id, expected, r, true);
  const restrictionConfigs = r.data.filter((c) => restrictionsOf(c).length);
  const defaults = restrictionConfigs.filter((c) => c.priority === 0);
  if (!defaults.length) {
    return result(id, expected, "Manual", "no default restriction found", "Could not identify the default platform restriction — verify in Intune > Devices > Enrollment.");
  }
  const allowed: string[] = [];
  const evidence: Evidence[] = [];
  for (const c of defaults) {
    for (const [platform, res] of restrictionsOf(c)) {
      evidence.push({ source: ENROLLMENT_CONFIGS, path: `${c.displayName ?? "default"}.${platform}`, value: { platformBlocked: res.platformBlocked, personalDeviceEnrollmentBlocked: res.personalDeviceEnrollmentBlocked } });
      if (!res.platformBlocked && !res.personalDeviceEnrollmentBlocked) allowed.push(platform);
    }
  }
  const reallowing = restrictionConfigs
    .filter((c) => (c.priority ?? 0) > 0 && restrictionsOf(c).some(([, res]) => !res.platformBlocked && !res.personalDeviceEnrollmentBlocked))
    .map((c) => c.displayName ?? "custom restriction");
  const info = reallowing.length ? ` Info: custom restriction(s) re-allow personal devices: ${reallowing.join(", ")}.` : "";
  return allowed.length
    ? result(id, expected, "Fail", `personal allowed: ${allowed.join(", ")}`, `The default restriction allows personally owned ${allowed.join(", ")} devices.${info}`, evidence)
    : result(id, expected, "Pass", "personal blocked", `The default restriction blocks personally owned devices on every allowed platform.${info}`, evidence);
};

export const INTUNE_CHECKS: Record<string, Check> = {
  "4.1": secureByDefault,
  "4.2": personalEnrollment,
};
