// ─── CIS L1 benchmark — check registry, evaluation and scoring ────────────────

import baselineJson from "./cis-l1-tenant.json";
import type { CheckContext } from "./context";
import { result } from "./context";
import type { CheckResult, CheckState, ManualAnswer, Nis2Measure, StateCounts, TenantCheck } from "./types";
import { CA_CHECKS, CA_POLICIES, SUBSCRIBED_SKUS } from "./checks/ca";
import { IDENTITY_CHECKS } from "./checks/identity";
import { DIRECTORY_CHECKS, AUTHZ, DEVICE_REG, ORGANIZATION } from "./checks/directory";
import { AUTH_CHECKS, AUTH_METHODS, GROUP_SETTINGS } from "./checks/authMethods";
import { INTUNE_CHECKS, ENROLLMENT_CONFIGS } from "./checks/intune";
import { GOVERNANCE_CHECKS, ACCESS_REVIEWS } from "./checks/governance";
import { ASSIGNMENTS, ELIGIBILITY } from "./checks/roles";

export const BASELINE_NAME: string = baselineJson.name;
export const BASELINE_SOURCE: string = baselineJson.source;
export const CHECKS = baselineJson.tenantChecks as TenantCheck[];

type Evaluator = (ctx: CheckContext, id: string, expected: string) => Promise<CheckResult>;

/** Evaluators keyed on check id. Adding a control = JSON entry + evaluator here. */
export const EVALUATORS: Record<string, Evaluator> = {
  ...IDENTITY_CHECKS,
  ...INTUNE_CHECKS,
  ...DIRECTORY_CHECKS,
  ...CA_CHECKS,
  ...AUTH_CHECKS,
  ...GOVERNANCE_CHECKS,
};

/**
 * Endpoints many checks share. The Collector reads these up front (warming the
 * per-run cache) so the activity feed shows the data gathering as its own step.
 */
export const SHARED_SOURCES: Array<{ label: string; path: string; all?: boolean }> = [
  { label: "Conditional Access policies", path: CA_POLICIES, all: true },
  { label: "Role assignments", path: ASSIGNMENTS, all: true },
  { label: "Eligible role assignments", path: ELIGIBILITY, all: true },
  { label: "Authorization policy", path: AUTHZ },
  { label: "Authentication methods policy", path: AUTH_METHODS },
  { label: "Device registration policy", path: DEVICE_REG },
  { label: "Directory settings", path: GROUP_SETTINGS, all: true },
  { label: "Organization", path: ORGANIZATION, all: true },
  { label: "Licences", path: SUBSCRIBED_SKUS, all: true },
  { label: "Enrollment restrictions", path: ENROLLMENT_CONFIGS, all: true },
  { label: "Access reviews", path: ACCESS_REVIEWS, all: true },
];

/** Technical CIS area → NIS2 art. 21(2) measures it supports. */
const AREA_NIS2: Record<string, Nis2Measure[]> = {
  "Admin accounts": ["i"],
  "Monitoring": ["b"],
  "Intune": ["i", "f"],
  "Entra users": ["i"],
  "Entra groups": ["i"],
  "Entra devices": ["i", "e"],
  "Enterprise apps": ["d", "i"],
  "External identities": ["i", "d"],
  "Hybrid": ["i"],
  "Conditional Access": ["j", "i"],
  "Auth methods": ["j"],
  "Password reset": ["i"],
  "ID Governance": ["i", "f"],
};

export function nis2For(check: TenantCheck): Nis2Measure[] {
  return AREA_NIS2[check.area] ?? [];
}

export const NIS2_MEASURES: Record<Nis2Measure, string> = {
  a: "Risk analysis & information security policies",
  b: "Incident handling",
  c: "Business continuity, backup & crisis management",
  d: "Supply chain security",
  e: "Secure acquisition, development & vulnerability handling",
  f: "Assessing the effectiveness of measures",
  g: "Basic cyber hygiene & training",
  h: "Cryptography & encryption",
  i: "HR security, access control & asset management",
  j: "MFA & secured communication",
};

/** Organisational NIS2 measures no tenant scan can prove — shown as a checklist. */
export const NIS2_MANUAL_CHECKS: Array<{ measure: Nis2Measure; text: string }> = [
  { measure: "a", text: "A documented, board-approved information security policy and risk analysis exist." },
  { measure: "b", text: "An incident response procedure exists, including the 24h / 72h reporting deadlines to the CSIRT." },
  { measure: "c", text: "Backups of business data (incl. M365) exist, are kept separately and restores are tested." },
  { measure: "d", text: "Security requirements for key suppliers and service providers are agreed and reviewed." },
  { measure: "f", text: "The effectiveness of security measures is reviewed periodically (e.g. this benchmark, quarterly)." },
  { measure: "g", text: "Staff and management receive regular security awareness training." },
  { measure: "h", text: "Devices and data at rest are encrypted (see the Windows device settings benchmark)." },
  { measure: "i", text: "Joiner / mover / leaver processes revoke access promptly." },
];

export function checkById(id: string): TenantCheck | undefined {
  return CHECKS.find((c) => c.id === id);
}

/** Runs one check. Manual checks and checks without an evaluator become Manual; a crash becomes Error. */
export async function runCheck(check: TenantCheck, ctx: CheckContext): Promise<CheckResult> {
  const evaluator = EVALUATORS[check.id];
  if (check.checkType === "manual" && !evaluator) {
    return result(check.id, check.expected, "Manual", "not assessed", `Verify manually: ${check.rule}`);
  }
  if (!evaluator) {
    return result(check.id, check.expected, "Manual", "not assessed", "No automatic evaluator yet — verify manually.");
  }
  try {
    return await evaluator(ctx, check.id, check.expected);
  } catch (err) {
    return result(check.id, check.expected, "Error", "unknown", `The check failed to run: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The state shown and scored: a manual answer overrides Manual results only. */
export function effectiveState(r: CheckResult, answers: Record<string, ManualAnswer>): CheckState {
  const a = answers[r.id];
  return r.state === "Manual" && a ? a.answer : r.state;
}

export function countStates(states: CheckState[]): StateCounts {
  const c: StateCounts = { Pass: 0, Fail: 0, Partial: 0, Manual: 0, NotApplicable: 0, Error: 0, score: 0 };
  for (const s of states) c[s]++;
  const scored = c.Pass + c.Fail + c.Partial;
  c.score = scored ? Math.round((c.Pass / scored) * 100) : 0;
  return c;
}
