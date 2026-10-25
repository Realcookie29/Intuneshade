// ─── IntuneShade Baseline — shared types ──────────────────────────────────────
// The baseline is our own control set. It *references* CIS benchmark IDs and
// NIS2 / Cyberbeveiligingswet articles but never reproduces CIS text.

export type Profile = "L1" | "L2" | "Extended";
export type Severity = "critical" | "high" | "medium" | "low";
export type FindingStatus = "pass" | "fail" | "manual" | "not_applicable" | "error";

/** NIS2 art. 21(2) measures (a–j). */
export type Nis2Measure = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";

export interface ControlRefs {
  /** Indicative CIS references, e.g. "M365 5.2.2.2". Verify against your licensed benchmark version. */
  cis: string[];
  nis2: Nis2Measure[];
}

export interface Control {
  id: string;
  title: string;
  /** Why it matters — our own words. */
  rationale: string;
  category: "identity" | "access" | "endpoint" | "compliance";
  profile: Profile;
  severity: Severity;
  refs: ControlRefs;
  /** Snapshot sources this control needs; a failed source makes the result "error", not "fail". */
  sources: SourceKey[];
  check: { evaluator: string; params?: Record<string, unknown> };
  /** Static fallback advice, used when no AI model is configured. */
  remediation: string;
}

// ─── Snapshot (Collector output) ──────────────────────────────────────────────

export type SourceKey =
  | "caPolicies"
  | "securityDefaults"
  | "authorizationPolicy"
  | "authMethodsPolicy"
  | "globalAdmins"
  | "configurationPolicies"
  | "deviceConfigurations"
  | "compliancePolicies"
  | "deviceManagementSettings"
  | "complianceSummary";

export interface SourceResult<T = unknown> {
  ok: boolean;
  /** Graph endpoint the data came from — shown as evidence. */
  endpoint: string;
  data?: T;
  error?: string;
}

export type TenantSnapshot = Partial<Record<SourceKey, SourceResult>> & {
  collectedAt: string;
};

// Minimal shapes of the Graph objects the evaluators read.

export interface CaPolicy {
  id: string;
  displayName: string;
  state: "enabled" | "disabled" | "enabledForReportingButNotEnforced";
  conditions?: {
    users?: { includeUsers?: string[]; excludeUsers?: string[]; includeRoles?: string[]; excludeGroups?: string[] };
    applications?: { includeApplications?: string[] };
    clientAppTypes?: string[];
    signInRiskLevels?: string[];
    userRiskLevels?: string[];
  };
  grantControls?: {
    builtInControls?: string[];
    authenticationStrength?: { id: string; displayName?: string } | null;
  } | null;
}

export interface IntunePolicy {
  id: string;
  name?: string;
  displayName?: string;
  isAssigned?: boolean;
  templateReference?: { templateFamily?: string } | null;
  "@odata.type"?: string;
  assignments?: unknown[];
}

// ─── Assessor / Advisor / Reporter output ─────────────────────────────────────

export interface Finding {
  controlId: string;
  status: FindingStatus;
  /** One-line, human-readable outcome. */
  summary: string;
  /** Raw facts backing the outcome (endpoint + relevant values). */
  evidence: { endpoint?: string; facts: string[] };
}

export interface Advice {
  controlId: string;
  explanation: string;
  priority: 1 | 2 | 3 | 4 | 5;
  effort: "low" | "medium" | "high";
  steps: string[];
  /** Suggested script — display only, never executed by IntuneShade. */
  script?: string;
  source: "ai" | "static";
}

export interface FrameworkScore {
  passed: number;
  failed: number;
  manual: number;
  errors: number;
  /** passed / (passed + failed), 0–100. Manual/error/n.a. excluded. */
  score: number;
}

export interface BenchmarkReport {
  generatedAt: string;
  tenantName: string;
  profile: Profile;
  overall: FrameworkScore;
  byCategory: Record<Control["category"], FrameworkScore>;
  byNis2: Record<Nis2Measure, FrameworkScore>;
  executiveSummary: string;
  keyRisks: string[];
  summarySource: "ai" | "static";
}
