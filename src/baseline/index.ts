// ─── IntuneShade Baseline — control set, assessment and scoring ───────────────

import controlsJson from "./controls.json";
import { EVALUATORS } from "./evaluators";
import type {
  Control,
  Finding,
  FrameworkScore,
  Nis2Measure,
  Profile,
  TenantSnapshot,
} from "./types";

export const BASELINE_VERSION = "0.1.0";

export const CONTROLS = controlsJson as Control[];

/** NIS2 art. 21(2) measures — short labels for the UI and reports. */
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

/**
 * Organisational NIS2 measures no tenant scan can prove. Shown as a manual
 * checklist next to the technical findings so the report never implies that a
 * green score equals NIS2 compliance.
 */
export const NIS2_MANUAL_CHECKS: Array<{ measure: Nis2Measure; text: string }> = [
  { measure: "a", text: "A documented, board-approved information security policy and risk analysis exist." },
  { measure: "b", text: "An incident response procedure exists, including the 24h / 72h reporting deadlines to the CSIRT." },
  { measure: "c", text: "Backups of business data (incl. M365) exist, are kept separately and restores are tested." },
  { measure: "d", text: "Security requirements for key suppliers and service providers are agreed and reviewed." },
  { measure: "f", text: "The effectiveness of security measures is reviewed periodically (e.g. this benchmark, quarterly)." },
  { measure: "g", text: "Staff and management receive regular security awareness training." },
  { measure: "i", text: "Joiner / mover / leaver processes revoke access promptly." },
];

/** Controls in scope for a profile. L2 includes L1; Extended includes everything. */
export function controlsForProfile(profile: Profile): Control[] {
  const rank: Record<Profile, number> = { L1: 1, L2: 2, Extended: 3 };
  return CONTROLS.filter((c) => rank[c.profile] <= rank[profile]);
}

/**
 * Evaluates one control. If a source the control needs could not be collected
 * (missing consent, licence, API error) the result is "error" — never a false
 * "fail".
 */
export function assessControl(control: Control, snap: TenantSnapshot): Finding {
  const failed = control.sources
    .map((key) => ({ key, src: snap[key] }))
    .filter(({ src }) => !src || !src.ok);
  // Security defaults is an optional alternative for the CA checks: only the
  // CA source is mandatory there.
  const blocking = failed.filter(({ key }) => !(key === "securityDefaults" && control.sources.includes("caPolicies")));
  if (blocking.length) {
    return {
      controlId: control.id,
      status: "error",
      summary: "Could not collect the data needed for this check.",
      evidence: { facts: blocking.map(({ key, src }) => `${key}: ${src?.error ?? "not collected"}`) },
    };
  }

  const evaluator = EVALUATORS[control.check.evaluator];
  if (!evaluator) {
    return {
      controlId: control.id,
      status: "error",
      summary: `Unknown evaluator "${control.check.evaluator}".`,
      evidence: { facts: [] },
    };
  }
  try {
    return { controlId: control.id, ...evaluator(snap, control.check.params ?? {}) };
  } catch (err) {
    return {
      controlId: control.id,
      status: "error",
      summary: "The check failed to run.",
      evidence: { facts: [err instanceof Error ? err.message : String(err)] },
    };
  }
}

export function score(findings: Finding[]): FrameworkScore {
  const count = (s: Finding["status"]) => findings.filter((f) => f.status === s).length;
  const passed = count("pass");
  const failed = count("fail");
  return {
    passed,
    failed,
    manual: count("manual"),
    errors: count("error"),
    score: passed + failed ? Math.round((passed / (passed + failed)) * 100) : 0,
  };
}

export function controlById(id: string): Control | undefined {
  return CONTROLS.find((c) => c.id === id);
}
