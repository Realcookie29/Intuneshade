import { describe, expect, it } from "vitest";
import { evaluateSetting, flattenSettings, judge, toAssignments, type EvalScope, type ScopeDevice, type WindowsPolicy } from "./windows/engine";
import { WINDOWS_MAPPINGS, windowsCheckId, type WindowsMapping } from "./windows/mapping";
import { CONFIG_POLICIES, WINDOWS_CHECKS } from "./checks/windows";
import { checkById, runCheck } from "./index";
import { createContext, type CheckOptions } from "./context";

const RTP = "device_vendor_msft_policy_config_defender_allowrealtimemonitoring";
const mapping = (cis: string): WindowsMapping => WINDOWS_MAPPINGS.find((m) => m.cis === cis)!;
const rtp = mapping("18.10.42.10.2");

const choice = (id: string, value: string, children: unknown[] = []) => ({
  settingInstance: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance", settingDefinitionId: id, choiceSettingValue: { value, children } },
});

const policy = (name: string, assignments: WindowsPolicy["assignments"], settings: Record<string, string | number | string[]>): WindowsPolicy => ({
  id: name, name, family: "Settings catalog", assignments, settings: new Map(Object.entries(settings)),
});

const TENANT: EvalScope = { kind: "tenant" };
const dev = (name: string, ...groups: string[]): ScopeDevice => ({ id: name, name, groups: new Set(groups) });

describe("Windows mapping", () => {
  it("has unique CIS ids and lowercase definition ids", () => {
    expect(new Set(WINDOWS_MAPPINGS.map((m) => m.cis)).size).toBe(WINDOWS_MAPPINGS.length);
    for (const m of WINDOWS_MAPPINGS) {
      for (const d of Array.isArray(m.def) ? m.def : [m.def]) expect(d, m.cis).toBe(d.toLowerCase());
    }
  });

  it("prefixes check ids so they never collide with M365 ids", () => {
    expect(WINDOWS_CHECKS.every((c) => c.id.startsWith("W-"))).toBe(true);
    expect(checkById("W-17.1.1")?.area).toBe("Windows: Audit");
  });
});

describe("settings flattening", () => {
  it("flattens nested choice children, simple values and collections", () => {
    const flat = flattenSettings(([
      choice("Parent_ID", "parent_id_1", [{ settingDefinitionId: "child_int", simpleSettingValue: { value: 15 } }]),
      { settingInstance: { settingDefinitionId: "list", simpleSettingCollectionValue: [{ value: "*S-1-5-19" }, { value: "*S-1-5-20" }] } },
      { settingInstance: { settingDefinitionId: "asr", groupSettingCollectionValue: [{ children: [choice("asr_rule_a", "asr_rule_a_block").settingInstance] }] } },
    ]) as Parameters<typeof flattenSettings>[0]);
    expect(flat.get("parent_id")).toBe("parent_id_1");
    expect(flat.get("child_int")).toBe(15);
    expect(flat.get("list")).toEqual(["*S-1-5-19", "*S-1-5-20"]);
    expect(flat.get("asr_rule_a")).toBe("asr_rule_a_block");
  });

  it("normalises assignment targets and ignores 'none' filters", () => {
    expect(toAssignments([
      { target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget", deviceAndAppManagementAssignmentFilterType: "none" } },
      { target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g1", deviceAndAppManagementAssignmentFilterId: "f1", deviceAndAppManagementAssignmentFilterType: "include" } },
      { target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: "g2" } },
    ])).toEqual([
      { kind: "allDevices" },
      { kind: "include", groupId: "g1", filterId: "f1", filterType: "include" },
      { kind: "exclude", groupId: "g2" },
    ]);
  });
});

describe("rules", () => {
  it("judges choice, int and SID rules", () => {
    expect(judge(RTP, `${RTP}_1`, { t: "choice", ok: ["_1"] })).toBe("ok");
    expect(judge(RTP, `${RTP}_0`, { t: "choice", ok: ["_1"] })).toBe("wrong");
    expect(judge("x", 30, { t: "int", max: 30, notZero: true })).toBe("ok");
    expect(judge("x", 0, { t: "int", max: 30, notZero: true })).toBe("wrong");
    expect(judge("x", ["*S-1-5-20", "LOCAL SERVICE"], { t: "sids", sids: ["S-1-5-19", "S-1-5-20"] })).toBe("ok");
    expect(judge("x", ["*S-1-5-19"], { t: "sids", sids: ["S-1-5-19", "S-1-5-20"] })).toBe("wrong");
  });
});

describe("tenant-wide evaluation", () => {
  it("passes when a policy assigned to all devices sets the expected value", () => {
    const r = evaluateSetting(rtp, { policies: [policy("AV", [{ kind: "allDevices" }], { [RTP]: `${RTP}_1` })], legacy: [], scope: TENANT });
    expect(r.state).toBe("Pass");
    expect(r.policies.map((p) => p.name)).toEqual(["AV"]);
  });

  it("fails and names the policy when the setting only lives in an unassigned policy", () => {
    const r = evaluateSetting(rtp, { policies: [policy("Draft AV", [], { [RTP]: `${RTP}_1` })], legacy: [], scope: TENANT });
    expect(r.state).toBe("Fail");
    expect(r.message).toContain("unassigned policy");
    expect(r.message).toContain("Draft AV");
  });

  it("gives Partial for group-only assignments and for conflicts", () => {
    const groupOnly = evaluateSetting(rtp, { policies: [policy("AV pilot", [{ kind: "include", groupId: "g1" }], { [RTP]: `${RTP}_1` })], legacy: [], scope: TENANT });
    expect(groupOnly.state).toBe("Partial");
    const conflict = evaluateSetting(rtp, {
      policies: [policy("A", [{ kind: "allDevices" }], { [RTP]: `${RTP}_1` }), policy("B", [{ kind: "allUsers" }], { [RTP]: `${RTP}_0` })],
      legacy: [], scope: TENANT,
    });
    expect(conflict.state).toBe("Partial");
    expect(conflict.actual).toBe("conflict");
  });

  it("does not claim Fail when assigned legacy profiles were not inspected", () => {
    const r = evaluateSetting(rtp, { policies: [], legacy: [{ id: "l", name: "Old EP", family: "Templates", assignments: [{ kind: "allDevices" }] }], scope: TENANT });
    expect(r.state).toBe("Manual");
  });

  it("scores the ASR composite per rule", () => {
    const asr = mapping("18.10.42.6.1.2");
    if (asr.rule.t !== "all") throw new Error("expected composite");
    const all = Object.fromEntries(asr.rule.children.map((c) => [c.def, `${c.def}_block`]));
    expect(evaluateSetting(asr, { policies: [policy("ASR", [{ kind: "allDevices" }], all)], legacy: [], scope: TENANT }).state).toBe("Pass");
    const [first, ...rest] = asr.rule.children;
    const someAudit = { ...all, [first.def]: `${first.def}_audit` };
    const r = evaluateSetting(asr, { policies: [policy("ASR", [{ kind: "allDevices" }], someAudit)], legacy: [], scope: TENANT });
    expect(r.state).toBe("Partial");
    expect(r.actual).toContain(`${rest.length}/${asr.rule.children.length}`);
  });
});

describe("deployment profile evaluation", () => {
  const scope: EvalScope = { kind: "profile", name: "Corporate laptops", devices: [dev("PC1", "laptops"), dev("PC2", "laptops", "pilot"), dev("PC3", "kiosk")], unresolved: 0 };

  it("passes only when every device of the profile gets the value", () => {
    const r = evaluateSetting(rtp, { policies: [policy("AV", [{ kind: "include", groupId: "laptops" }, { kind: "include", groupId: "kiosk" }], { [RTP]: `${RTP}_1` })], legacy: [], scope });
    expect(r.state).toBe("Pass");
    expect(r.actual).toBe("3/3 devices");
  });

  it("honours exclusions and reports per-device coverage", () => {
    const r = evaluateSetting(rtp, { policies: [policy("AV", [{ kind: "allDevices" }, { kind: "exclude", groupId: "kiosk" }], { [RTP]: `${RTP}_1` })], legacy: [], scope });
    expect(r.state).toBe("Partial");
    expect(r.actual).toBe("2/3 devices");
    expect(r.table?.rows.find((row) => row[0] === "PC3")?.[1]).toBe("Not configured");
  });

  it("flags conflicts on a single device and assignment filters", () => {
    const r = evaluateSetting(rtp, {
      policies: [
        policy("AV", [{ kind: "include", groupId: "laptops", filterId: "f1" }, { kind: "include", groupId: "kiosk" }], { [RTP]: `${RTP}_1` }),
        policy("AV pilot", [{ kind: "include", groupId: "pilot" }], { [RTP]: `${RTP}_0` }),
      ],
      legacy: [], scope,
    });
    expect(r.state).toBe("Partial");
    expect(r.table?.rows.find((row) => row[0] === "PC2")?.[1]).toBe("Conflict");
    expect(r.message).toContain("filters are not evaluated");
  });

  it("is not applicable when no device could be resolved", () => {
    const r = evaluateSetting(rtp, { policies: [], legacy: [], scope: { kind: "profile", name: "Empty", devices: [], unresolved: 2 } });
    expect(r.state).toBe("NotApplicable");
  });
});

// ─── Through the check context (Graph fixtures) ───────────────────────────────

type Fixture = Record<string, unknown>;
function reader(fixture: Fixture) {
  const lookup = (path: string) => fixture[path] === undefined
    ? Promise.reject(Object.assign(new Error(`Graph API GET ${path} → 404: {}`), { status: 404 }))
    : Promise.resolve(fixture[path]);
  return { get: lookup, getAll: (p: string) => lookup(p) as Promise<unknown[]> };
}

const CATALOG = (def: string) => `/beta/deviceManagement/configurationSettings/${def}`;
const POLICY_BASE = "/beta/deviceManagement/configurationPolicies('p1')";

function fixture(extra: Fixture = {}): Fixture {
  return {
    [CONFIG_POLICIES]: [{ id: "p1", name: "Defender AV", platforms: "windows10", technologies: "mdm,microsoftSense", templateReference: { templateFamily: "endpointSecurityAntivirus", templateDisplayName: "Microsoft Defender Antivirus" } }],
    [`${POLICY_BASE}/assignments`]: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "laptops" } }],
    [`${POLICY_BASE}/settings`]: [choice(RTP, `${RTP}_1`)],
    "/beta/deviceManagement/deviceConfigurations?$expand=assignments": [],
    "/beta/deviceManagement/groupPolicyConfigurations?$expand=assignments": [],
    "/beta/deviceManagement/intents?$select=id,displayName,isAssigned": [],
    [CATALOG(RTP)]: { id: RTP, displayName: "Allow Realtime Monitoring", options: [{ itemId: `${RTP}_0`, displayName: "Not allowed" }, { itemId: `${RTP}_1`, displayName: "Allowed" }] },
    "/beta/deviceManagement/windowsAutopilotDeploymentProfiles/prof1/assignedDevices": [
      { id: "a1", serialNumber: "SN1", azureActiveDirectoryDeviceId: "aad-1" },
      { id: "a2", serialNumber: "SN2", azureActiveDirectoryDeviceId: "00000000-0000-0000-0000-000000000000" },
    ],
    "/v1.0/devices?$filter=deviceId eq 'aad-1'&$select=id,displayName": { value: [{ id: "obj-1", displayName: "PC1" }] },
    "/v1.0/devices/obj-1/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999": [{ id: "laptops" }],
    ...extra,
  };
}

const OPTS: CheckOptions = { breakGlass: [], fullPerUserMfaScan: false };
const runW = (cis: string, fx: Fixture, options: CheckOptions = OPTS) =>
  runCheck(checkById(windowsCheckId(cis))!, createContext(reader(fx), options));

describe("Windows checks through Graph", () => {
  it("uses Microsoft's catalog names and judges the deployment profile's devices", async () => {
    const r = await runW("18.10.42.10.2", fixture(), { ...OPTS, deviceScope: { kind: "profile", id: "prof1", name: "Corporate" } });
    expect(r.state).toBe("Pass");
    expect(r.expected).toBe("Allowed");
    expect(r.message).toContain("Allow Realtime Monitoring");
    expect(r.message).toContain("1 device(s) in the profile could not be resolved");
  });

  it("is Partial tenant-wide when the policy only targets a group", async () => {
    expect((await runW("18.10.42.10.2", fixture())).state).toBe("Partial");
  });

  it("turns an unknown catalog id into Manual instead of a false Fail", async () => {
    const r = await runW("18.10.42.10.3", fixture());
    expect(r.state).toBe("Manual");
    expect(r.message).toContain("Mapping needs review");
  });

  it("turns an expected option that the catalog does not offer into Manual", async () => {
    const r = await runW("18.10.42.10.2", fixture({ [CATALOG(RTP)]: { id: RTP, options: [{ itemId: `${RTP}_0` }] } }));
    expect(r.state).toBe("Manual");
  });

  it("reports an unreadable inventory as Error", async () => {
    const r = await runW("18.10.42.10.2", { ...fixture(), [CONFIG_POLICIES]: undefined });
    expect(r.state).toBe("Error");
  });
});
