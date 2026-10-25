import { describe, expect, it } from "vitest";
import { CONTROLS, assessControl, controlById, controlsForProfile, score } from "./index";
import { EVALUATORS, ROLE_GLOBAL_ADMIN } from "./evaluators";
import type { CaPolicy, SourceKey, TenantSnapshot } from "./types";
import { maskFacts } from "../services/ai/mask";

function snap(sources: Partial<Record<SourceKey, unknown>>): TenantSnapshot {
  const s: TenantSnapshot = { collectedAt: "2026-10-25T00:00:00Z" };
  for (const [k, data] of Object.entries(sources)) {
    s[k as SourceKey] = { ok: true, endpoint: `/${k}`, data };
  }
  return s;
}

const mfaAll: CaPolicy = {
  id: "1",
  displayName: "CA001 Require MFA",
  state: "enabled",
  conditions: { users: { includeUsers: ["All"], excludeUsers: ["bg1", "bg2"] }, applications: { includeApplications: ["All"] } },
  grantControls: { builtInControls: ["mfa"] },
};

const blockLegacy: CaPolicy = {
  id: "2",
  displayName: "CA002 Block legacy",
  state: "enabled",
  conditions: {
    users: { includeUsers: ["All"] },
    applications: { includeApplications: ["All"] },
    clientAppTypes: ["exchangeActiveSync", "other"],
  },
  grantControls: { builtInControls: ["block"] },
};

const run = (id: string, s: TenantSnapshot) => assessControl(controlById(id)!, s);

describe("control set", () => {
  it("has unique ids and only known evaluators", () => {
    const ids = CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CONTROLS) expect(EVALUATORS[c.check.evaluator], c.id).toBeTypeOf("function");
  });

  it("profiles are cumulative", () => {
    const l1 = controlsForProfile("L1").length;
    const l2 = controlsForProfile("L2").length;
    expect(l2).toBeGreaterThan(l1);
    expect(controlsForProfile("Extended").length).toBe(CONTROLS.length);
  });
});

describe("Conditional Access checks", () => {
  it("passes MFA-for-all with an enforced policy and notes exclusions", () => {
    const f = run("ISB-ID-01", snap({ caPolicies: [mfaAll], securityDefaults: { isEnabled: false } }));
    expect(f.status).toBe("pass");
    expect(f.summary).toContain("2 exclusions");
  });

  it("fails when the only matching policy is report-only", () => {
    const f = run("ISB-ID-01", snap({
      caPolicies: [{ ...mfaAll, state: "enabledForReportingButNotEnforced" }],
      securityDefaults: { isEnabled: false },
    }));
    expect(f.status).toBe("fail");
    expect(f.summary).toContain("report-only");
  });

  it("accepts security defaults as MFA and legacy-auth protection", () => {
    const s = snap({ caPolicies: [], securityDefaults: { isEnabled: true } });
    expect(run("ISB-ID-01", s).status).toBe("pass");
    expect(run("ISB-ID-03", s).status).toBe("pass");
  });

  it("does not fail CA checks when only the optional security-defaults source is missing", () => {
    const s = snap({ caPolicies: [blockLegacy] });
    expect(run("ISB-ID-03", s).status).toBe("pass");
  });

  it("requires the phishing-resistant strength for admins", () => {
    const strong: CaPolicy = {
      ...mfaAll,
      conditions: { users: { includeRoles: [ROLE_GLOBAL_ADMIN] }, applications: { includeApplications: ["All"] } },
      grantControls: { authenticationStrength: { id: "00000000-0000-0000-0000-000000000004" } },
    };
    expect(run("ISB-ID-04", snap({ caPolicies: [mfaAll] })).status).toBe("fail");
    expect(run("ISB-ID-04", snap({ caPolicies: [strong] })).status).toBe("pass");
  });
});

describe("directory checks", () => {
  it("global admin count must be 2–4", () => {
    const admins = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
    expect(run("ISB-ID-07", snap({ globalAdmins: admins(1) })).status).toBe("fail");
    expect(run("ISB-ID-07", snap({ globalAdmins: admins(3) })).status).toBe("pass");
    expect(run("ISB-ID-07", snap({ globalAdmins: admins(6) })).status).toBe("fail");
  });

  it("reads nested authorization policy fields", () => {
    const authz = { defaultUserRolePermissions: { allowedToCreateApps: false, allowedToCreateTenants: true } };
    expect(run("ISB-AC-01", snap({ authorizationPolicy: authz })).status).toBe("pass");
    expect(run("ISB-AC-05", snap({ authorizationPolicy: authz })).status).toBe("fail");
  });

  it("flags legacy user consent in either beta or v1.0 shape", () => {
    const beta = { permissionGrantPolicyIdsAssignedToDefaultUserRole: ["ManagePermissionGrantsForSelf.microsoft-user-default-legacy"] };
    const v1 = { defaultUserRolePermissions: { permissionGrantPoliciesAssigned: [] } };
    expect(run("ISB-AC-02", snap({ authorizationPolicy: beta })).status).toBe("fail");
    expect(run("ISB-AC-02", snap({ authorizationPolicy: v1 })).status).toBe("pass");
    expect(run("ISB-AC-02", snap({ authorizationPolicy: {} })).status).toBe("manual");
  });
});

describe("Intune checks", () => {
  it("passes an assigned endpoint security policy and ignores unassigned ones", () => {
    const disk = { id: "a", name: "BitLocker", templateReference: { templateFamily: "endpointSecurityDiskEncryption" } };
    expect(run("ISB-EP-01", snap({ configurationPolicies: [{ ...disk, isAssigned: true }], deviceConfigurations: [] })).status).toBe("pass");
    const f = run("ISB-EP-01", snap({ configurationPolicies: [{ ...disk, isAssigned: false }], deviceConfigurations: [] }));
    expect(f.status).toBe("fail");
    expect(f.summary).toContain("none are assigned");
  });

  it("treats a legacy profile or security baseline as manual, not pass", () => {
    const legacy = { id: "l", displayName: "EP legacy", "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration", assignments: [{}] };
    expect(run("ISB-EP-01", snap({ configurationPolicies: [], deviceConfigurations: [legacy] })).status).toBe("manual");
    const baseline = { id: "b", name: "Win baseline", templateReference: { templateFamily: "baseline" }, isAssigned: true };
    expect(run("ISB-EP-03", snap({ configurationPolicies: [baseline], deviceConfigurations: [] })).status).toBe("manual");
  });

  it("computes the non-compliance ratio", () => {
    const s = (bad: number, good: number) => snap({ complianceSummary: { nonCompliantDeviceCount: bad, compliantDeviceCount: good } });
    expect(run("ISB-CO-04", s(5, 95)).status).toBe("pass");
    expect(run("ISB-CO-04", s(20, 80)).status).toBe("fail");
    expect(run("ISB-CO-04", s(0, 0)).status).toBe("not_applicable");
  });
});

describe("engine", () => {
  it("returns error, not fail, when a source could not be collected", () => {
    const s: TenantSnapshot = { collectedAt: "", globalAdmins: { ok: false, endpoint: "/x", error: "403 Forbidden" } };
    const f = run("ISB-ID-07", s);
    expect(f.status).toBe("error");
    expect(f.evidence.facts[0]).toContain("403");
  });

  it("scores pass / (pass + fail) and ignores manual and error", () => {
    const sc = score([
      { controlId: "a", status: "pass", summary: "", evidence: { facts: [] } },
      { controlId: "b", status: "fail", summary: "", evidence: { facts: [] } },
      { controlId: "c", status: "manual", summary: "", evidence: { facts: [] } },
      { controlId: "d", status: "error", summary: "", evidence: { facts: [] } },
    ]);
    expect(sc).toMatchObject({ passed: 1, failed: 1, manual: 1, errors: 1, score: 50 });
  });
});

describe("masking", () => {
  it("removes quoted names and e-mail addresses before data goes to a hosted model", () => {
    expect(maskFacts([`Enforced by "CA001 Contoso MFA"`, "owner jan@contoso.nl"])).toEqual([
      `Enforced by "[name]"`,
      "owner [user]",
    ]);
  });
});
