// ─── CIS L1 benchmark — shared types ──────────────────────────────────────────
// Checks come from cis-l1-tenant.json (CIS IDs + our own titles and rules).
// Each check is evaluated by a small evaluator keyed on its id.

export type CheckState = "Pass" | "Fail" | "Partial" | "Manual" | "NotApplicable" | "Error";
export type Severity = "High" | "Medium" | "Low";
export type CheckType = "auto" | "auto-beta" | "manual";

/** NIS2 art. 21(2) measures (a–j). */
export type Nis2Measure = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";

export interface TenantCheck {
  id: string;
  title: string;
  area: string;
  checkType: CheckType;
  graph: string[];
  rule: string;
  expected: string;
  severity: Severity;
  notes?: string;
}

/** One reproducible fact: which Graph path, which property, which value. */
export interface Evidence {
  source: string;
  path: string;
  value: unknown;
}

export interface CheckResult {
  id: string;
  state: CheckState;
  actual: string;
  expected: string;
  evidence: Evidence[];
  message: string;
  /** Optional detail list (e.g. users who are not MFA capable), exportable as CSV. */
  table?: { name: string; columns: string[]; rows: string[][] };
}

export interface ManualAnswer {
  answer: "Pass" | "Fail" | "NotApplicable";
  notes: string;
  updated: string;
}

/** Which devices the Windows settings are judged for: tenant-wide, or the devices of one Autopilot deployment profile. */
export type DeviceScopePref = { kind: "tenant" } | { kind: "profile"; id: string; name: string };

export interface BreakGlassAccount {
  id: string;
  userPrincipalName: string;
  displayName: string;
}

export interface Advice {
  id: string;
  explanation: string;
  priority: 1 | 2 | 3 | 4 | 5;
  effort: "low" | "medium" | "high";
  steps: string[];
  /** Suggested script — display only, never executed by IntuneShade. */
  script?: string;
  source: "ai" | "static";
}

export interface StateCounts {
  Pass: number;
  Fail: number;
  Partial: number;
  Manual: number;
  NotApplicable: number;
  Error: number;
  /** Pass / (Pass + Fail + Partial), 0–100. Manual, N/A and Error are excluded. */
  score: number;
}

export interface Coverage {
  assessed: number;
  total: number;
  /** Areas with no selected check. */
  areasNotAssessed: string[];
}

export interface BenchmarkReport {
  generatedAt: string;
  tenantName: string;
  overall: StateCounts;
  byArea: Record<string, StateCounts>;
  byNis2: Record<Nis2Measure, StateCounts>;
  /** How much of the benchmark this run assessed — always shown next to the score. */
  coverage: Coverage;
  /** Scope of the Windows device settings ("tenant-wide …" / "deployment profile …"), when any were assessed. */
  deviceScope?: string;
  executiveSummary: string;
  keyRisks: string[];
  summarySource: "ai" | "static";
}
