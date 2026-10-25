import { describe, expect, it, vi } from "vitest";

// The reporter imports the AI provider, which reads browser storage at load time.
vi.mock("../services/ai/provider", () => ({ runAgentPrompt: vi.fn() }));

import { CHECKS, EVALUATORS, checkById, countStates, effectiveState, runCheck } from "./index";
import { createContext, isoDays, type CheckOptions } from "./context";
import { CA_POLICIES, evaluateCa, grantMfa, type CaPolicy } from "./checks/ca";
import { GROUP_SETTINGS } from "./checks/authMethods";
import { ROLE_GLOBAL_ADMIN } from "./checks/roles";
import type { CheckResult } from "./types";
import { scoreResults, toCsv } from "../services/agents/reporter";
import { maskFacts } from "../services/ai/mask";

// ─── Fixture reader ───────────────────────────────────────────────────────────
// Maps a Graph path to response data, or to an HTTP status (thrown like the real
// client does). Unknown paths answer 404.

type Fixture = Record<string, unknown | { status: number }>;

const isStatus = (v: unknown): v is { status: number } =>
  !!v && typeof v === "object" && "status" in v && Object.keys(v).length === 1;

function reader(fixture: Fixture) {
  const calls: string[] = [];
  const lookup = (path: string) => {
    calls.push(path);
    const v = fixture[path];
    if (v === undefined || isStatus(v)) {
      const status = v === undefined ? 404 : v.status;
      return Promise.reject(Object.assign(new Error(`Graph API GET ${path} → ${status}: {}`), { status }));
    }
    return Promise.resolve(v);
  };
  return {
    calls,
    get: (path: string) => lookup(path),
    getAll: (path: string) => lookup(path) as Promise<unknown[]>,
  };
}

const OPTIONS: CheckOptions = { breakGlass: [{ id: "bg1", displayName: "BG 1", userPrincipalName: "bg1@x" }], fullPerUserMfaScan: false };

async function run(id: string, fixture: Fixture, options = OPTIONS): Promise<CheckResult> {
  return runCheck(checkById(id)!, createContext(reader(fixture), options));
}

const policy = (p: Partial<CaPolicy> & Pick<CaPolicy, "displayName">): CaPolicy => ({
  id: p.displayName,
  state: "enabled",
  conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"] } },
  ...p,
});

const mfaAll = policy({ displayName: "CA001 MFA", grantControls: { builtInControls: ["mfa"] } });

// ─── Registry ─────────────────────────────────────────────────────────────────

describe("check registry", () => {
  it("has 52 unique tenant checks with titles", () => {
    expect(CHECKS).toHaveLength(52);
    expect(new Set(CHECKS.map((c) => c.id)).size).toBe(52);
    for (const c of CHECKS) expect(c.title, c.id).toBeTruthy();
  });

  it("has an evaluator for every automatic check", () => {
    for (const c of CHECKS.filter((x) => x.checkType !== "manual")) {
      expect(EVALUATORS[c.id], c.id).toBeTypeOf("function");
    }
  });

  it("only uses GET paths in the check definitions", () => {
    for (const c of CHECKS) for (const g of c.graph) expect(g.startsWith("GET ") || !/^(POST|PATCH|PUT|DELETE) /.test(g), c.id).toBe(true);
  });
});

// ─── Context ──────────────────────────────────────────────────────────────────

describe("context", () => {
  it("caches identical requests within a run", async () => {
    const r = reader({ [CA_POLICIES]: [mfaAll] });
    const ctx = createContext(r, OPTIONS);
    await ctx.getAll(CA_POLICIES);
    await ctx.getAll(CA_POLICIES);
    expect(r.calls).toHaveLength(1);
  });

  it("reports 403 as a missing permission instead of throwing", async () => {
    const ctx = createContext(reader({ [CA_POLICIES]: { status: 403 } }), OPTIONS);
    const f = await ctx.getAll(CA_POLICIES);
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error).toMatch(/missing permission/);
  });

  it("parses ISO durations", () => {
    expect(isoDays("P180D")).toBe(180);
    expect(isoDays("P1Y")).toBe(365);
    expect(isoDays("PT12H")).toBe(0.5);
    expect(isoDays("nonsense")).toBeNaN();
  });
});

// ─── Conditional Access engine ────────────────────────────────────────────────

describe("evaluateCa", () => {
  const spec = { core: grantMfa, scope: "allUsers" as const, requireAllApps: true, lookingFor: "requires MFA" };
  const bg = new Set(["bg1"]);

  it("passes on an enforced all-users / all-apps policy, allowing break-glass exclusions", () => {
    const p = policy({ displayName: "MFA", grantControls: { builtInControls: ["mfa"] },
      conditions: { users: { includeUsers: ["All"], excludeUsers: ["bg1"] }, applications: { includeApplications: ["All"] } } });
    expect(evaluateCa([p], spec, bg).state).toBe("Pass");
  });

  it("is Partial for report-only policies", () => {
    const p = { ...mfaAll, state: "enabledForReportingButNotEnforced" as const };
    const o = evaluateCa([p], spec, bg);
    expect(o.state).toBe("Partial");
    expect(o.message).toMatch(/report-only/);
  });

  it("is Partial for exclusions beyond break-glass", () => {
    const p = policy({ displayName: "MFA", grantControls: { builtInControls: ["mfa"] },
      conditions: { users: { includeUsers: ["All"], excludeUsers: ["bg1", "someone"] }, applications: { includeApplications: ["All"] } } });
    expect(evaluateCa([p], spec, bg).message).toMatch(/not tagged as break-glass/);
  });

  it("is Partial when scoped to groups or with a platform carve-out", () => {
    const scoped = policy({ displayName: "MFA", grantControls: { builtInControls: ["mfa"] },
      conditions: { users: { includeGroups: ["g1"] }, applications: { includeApplications: ["All"] } } });
    expect(evaluateCa([scoped], spec, bg).state).toBe("Partial");
    const carve = policy({ displayName: "MFA", grantControls: { builtInControls: ["mfa"] },
      conditions: { ...mfaAll.conditions, platforms: { includePlatforms: ["windows"] } } });
    expect(evaluateCa([carve], spec, bg).state).toBe("Partial");
  });

  it("fails without a relevant policy and ignores disabled ones", () => {
    expect(evaluateCa([{ ...mfaAll, state: "disabled" }], spec, bg).state).toBe("Fail");
    expect(evaluateCa([], spec, bg).state).toBe("Fail");
  });

  it("flags policies without target resources as ineffective", () => {
    const p = policy({ displayName: "Empty", grantControls: { builtInControls: ["mfa"] },
      conditions: { users: { includeUsers: ["All"] }, applications: {} } });
    const o = evaluateCa([p], spec, bg);
    expect(o.state).toBe("Fail");
    expect(o.message).toMatch(/Ineffective/);
  });
});

describe("CA checks", () => {
  it("5.2.2.2 passes with an MFA policy for all users", async () => {
    expect((await run("5.2.2.2", { [CA_POLICIES]: [mfaAll] })).state).toBe("Pass");
  });

  it("5.2.2.3 requires both EAS and other clients blocked", async () => {
    const both = policy({ displayName: "Legacy", grantControls: { builtInControls: ["block"] },
      conditions: { ...mfaAll.conditions, clientAppTypes: ["exchangeActiveSync", "other"] } });
    const easOnly = policy({ displayName: "Legacy", grantControls: { builtInControls: ["block"] },
      conditions: { ...mfaAll.conditions, clientAppTypes: ["exchangeActiveSync"] } });
    expect((await run("5.2.2.3", { [CA_POLICIES]: [both] })).state).toBe("Pass");
    expect((await run("5.2.2.3", { [CA_POLICIES]: [easOnly] })).state).toBe("Fail");
  });

  it("5.2.2.4 needs both sign-in frequency and persistent browser for admins", async () => {
    const admins = { users: { includeRoles: [ROLE_GLOBAL_ADMIN] }, applications: { includeApplications: ["All"] } };
    const freqOnly = policy({ displayName: "Admin SIF", conditions: admins,
      sessionControls: { signInFrequency: { isEnabled: true, value: 4, type: "hours" } } });
    const both = policy({ displayName: "Admin sessions", conditions: admins,
      sessionControls: { signInFrequency: { isEnabled: true, value: 4, type: "hours" }, persistentBrowser: { isEnabled: true, mode: "never" } } });
    expect((await run("5.2.2.4", { [CA_POLICIES]: [freqOnly] })).state).toBe("Fail");
    expect((await run("5.2.2.4", { [CA_POLICIES]: [both] })).state).toBe("Pass");
  });

  it("risk checks are N/A without Entra ID P2", async () => {
    const skus = [{ capabilityStatus: "Enabled", servicePlans: [{ servicePlanName: "AAD_PREMIUM" }] }];
    const r = await run("5.2.2.6", { [CA_POLICIES]: [mfaAll], "/v1.0/subscribedSkus?$select=skuPartNumber,capabilityStatus,servicePlans": skus });
    expect(r.state).toBe("NotApplicable");
  });

  it("CA read failures become Error, never Fail", async () => {
    const r = await run("5.2.2.2", { [CA_POLICIES]: { status: 403 } });
    expect(r.state).toBe("Error");
    expect(r.message).toMatch(/missing permission/);
  });
});

// ─── Other evaluators ─────────────────────────────────────────────────────────

describe("password rule settings", () => {
  it("uses tenant defaults when no settings object exists", async () => {
    const threshold = await run("5.2.3.8", { [GROUP_SETTINGS]: [] });
    expect(threshold.state).toBe("Pass");
    expect(threshold.actual).toMatch(/default/);
    expect((await run("5.2.3.9", { [GROUP_SETTINGS]: [] })).state).toBe("Pass");
  });

  it("fails a lockout threshold above 10", async () => {
    const settings = [{ templateId: "5cf42378-d67d-4f36-ba46-e8b86229381d", values: [{ name: "LockoutThreshold", value: "50" }] }];
    expect((await run("5.2.3.8", { [GROUP_SETTINGS]: settings })).state).toBe("Fail");
  });
});

describe("PIM approval", () => {
  const path = (role: string) =>
    `/v1.0/policies/roleManagementPolicyAssignments?$filter=scopeId eq '/' and scopeType eq 'DirectoryRole' and roleDefinitionId eq '${role}'&$expand=policy($expand=rules)`;
  const rules = (required: boolean, approvers: number) => [{
    policy: { rules: [{ id: "Approval_EndUser_Assignment", setting: { isApprovalRequired: required, approvalStages: [{ primaryApprovers: Array(approvers).fill({}) }] } }] },
  }];

  it("passes with approval and approvers, partial without approvers, fails without approval", async () => {
    expect((await run("5.3.4", { [path(ROLE_GLOBAL_ADMIN)]: rules(true, 2) })).state).toBe("Pass");
    expect((await run("5.3.4", { [path(ROLE_GLOBAL_ADMIN)]: rules(true, 0) })).state).toBe("Partial");
    expect((await run("5.3.4", { [path(ROLE_GLOBAL_ADMIN)]: rules(false, 0) })).state).toBe("Fail");
  });
});

describe("directory settings", () => {
  it("5.1.2.2 compares the authorization policy", async () => {
    const authz = (v: boolean) => ({ "/v1.0/policies/authorizationPolicy": { defaultUserRolePermissions: { allowedToCreateApps: v } } });
    expect((await run("5.1.2.2", authz(false))).state).toBe("Pass");
    expect((await run("5.1.2.2", authz(true))).state).toBe("Fail");
  });

  it("beta endpoints that are unavailable degrade to Manual", async () => {
    const r = await run("5.1.2.4", { "/beta/admin/entra/uxSetting": { status: 404 } });
    expect(r.state).toBe("Manual");
  });
});

// ─── Engine + scoring ─────────────────────────────────────────────────────────

describe("engine", () => {
  it("manual checks without an evaluator become Manual", async () => {
    const manual = CHECKS.find((c) => c.checkType === "manual" && !EVALUATORS[c.id]);
    if (!manual) return;
    expect((await runCheck(manual, createContext(reader({}), OPTIONS))).state).toBe("Manual");
  });

  it("a crashing evaluator becomes Error", async () => {
    const ctx = createContext({ get: () => { throw new Error("boom"); }, getAll: () => { throw new Error("boom"); } }, OPTIONS);
    const r = await runCheck(checkById("5.2.2.2")!, ctx);
    expect(["Error"]).toContain(r.state);
  });

  it("manual answers override Manual results only", () => {
    const answers = { a: { answer: "Pass" as const, notes: "", updated: "" }, b: { answer: "Pass" as const, notes: "", updated: "" } };
    const base = { actual: "", expected: "", evidence: [], message: "" };
    expect(effectiveState({ ...base, id: "a", state: "Manual" }, answers)).toBe("Pass");
    expect(effectiveState({ ...base, id: "b", state: "Fail" }, answers)).toBe("Fail");
  });

  it("scores Pass / (Pass + Partial + Fail)", () => {
    const c = countStates(["Pass", "Pass", "Partial", "Fail", "Manual", "NotApplicable", "Error"]);
    expect(c.score).toBe(50);
    expect(c.Manual).toBe(1);
  });

  it("scores by area and NIS2 measure", () => {
    const base = { actual: "", expected: "", evidence: [], message: "" };
    const s = scoreResults([{ ...base, id: "5.2.2.2", state: "Pass" }, { ...base, id: "5.2.2.3", state: "Fail" }], {});
    expect(s.byArea["Conditional Access"].score).toBe(50);
    expect(s.byNis2.j.Pass).toBe(1);
  });
});

describe("exports and masking", () => {
  it("CSV quotes values and neutralises formulas", () => {
    expect(toCsv(["a", "b"], [["=cmd()", 'x,"y"']])).toBe(`a,b\r\n'=cmd(),"x,""y"""`);
  });

  it("masks names and UPNs", () => {
    expect(maskFacts([`Enforced by "CA001 Contoso MFA"`, "owner jan@contoso.nl"])).toEqual([
      `Enforced by "[name]"`,
      "owner [user]",
    ]);
  });
});
