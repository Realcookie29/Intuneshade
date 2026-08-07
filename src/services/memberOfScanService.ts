import { graphGet, graphGetAll } from "./graphClient";
import { getAssignments, isAssignmentsCached, type AssignmentRecord, type ScanProgress } from "./assignmentScanService";
import {
  MAX_RULE_LENGTH,
  parseMemberOfClauses,
  replaceClauses,
  ruleSubject,
  usesMemberOf,
  type MemberOfClause,
} from "../utils/memberOfRule";
import type { PolicyType } from "../types/policyTypes";
import type { AdministrativeUnit, DynamicGroup } from "../types/graphTypes";

/**
 * memberOf migration scanner.
 *
 * Entra ID is retiring the `memberOf` operator in dynamic membership rules.
 * Once it is gone, every rule that uses it stops evaluating — the group or
 * administrative unit keeps existing but silently stops gaining members, which
 * in Intune means policies and apps quietly stop landing on the right people.
 *
 * This module finds every dynamic group and dynamic administrative unit whose
 * rule uses `memberOf`, resolves the groups those rules point at, works out
 * what breaks in Intune, and — where it can do so safely — proposes a rewritten
 * rule that no longer needs `memberOf`.
 *
 * This is a migration aid with a shelf life. It can be removed once the tenant
 * is clean and the retirement date has passed.
 */

/**
 * Retirement date used for the countdown.
 *
 * Microsoft has announced the retirement for November 2026 without (at time of
 * writing) a published day-level date, so this is the conservative reading:
 * assume it can happen on the first day of the month. Confirm against the
 * Message Center post for the tenant and adjust here if a firm date lands.
 */
export const MEMBEROF_RETIREMENT_DATE = "2026-11-01";

export { usesMemberOf, parseMemberOfClauses } from "../utils/memberOfRule";
export type { MemberOfClause } from "../utils/memberOfRule";

// ─── Findings ───────────────────────────────────────────────────────────────

export type TargetObjectKind = "group" | "administrativeUnit";

/** A group pointed at by a memberOf clause, with everything needed to judge it. */
export interface ReferencedGroup {
  id: string;
  displayName: string;
  /** False when the group could not be read — usually because it was deleted. */
  exists: boolean;
  isDynamic: boolean;
  membershipRule: string | null;
  /** The referenced group's own rule also uses memberOf, so this is a chain. */
  usesMemberOf: boolean;
}

export type RemediationKind =
  | "inlineRewrite" // every source group is dynamic and memberOf-free → rule can be flattened
  | "nestedChain" // a source group itself uses memberOf → migrate inner rules first
  | "brokenReference" // the rule points at a group that no longer exists
  | "manual"; // static sources, negation, or a shape we refuse to rewrite blind

export type Severity = "high" | "medium" | "low";

export interface ImpactedPolicy {
  policyId: string;
  policyName: string;
  policyType: PolicyType;
  mode: "include" | "exclude";
}

export interface MemberOfFinding {
  kind: TargetObjectKind;
  id: string;
  displayName: string;
  description: string;
  membershipRule: string;
  /** "On" or "Paused" — a paused rule is already not evaluating. */
  processingState: string;
  createdDateTime: string | null;
  clauses: MemberOfClause[];
  referenced: ReferencedGroup[];
  remediation: RemediationKind;
  /** A drop-in replacement rule, only when we can build one safely. */
  suggestedRule: string | null;
  notes: string[];
  /** null until the Intune impact pass has run. */
  policies: ImpactedPolicy[] | null;
  severity: Severity;
}

const REMEDIATION_LABELS: Record<RemediationKind, string> = {
  inlineRewrite: "Rule can be flattened",
  nestedChain: "Nested — migrate inner rule first",
  brokenReference: "Points at a missing group",
  manual: "Needs manual rewrite",
};

export function remediationLabel(kind: RemediationKind): string {
  return REMEDIATION_LABELS[kind];
}

/** Whole days from today until the retirement date (negative once passed). */
export function daysUntilRetirement(now = new Date()): number {
  const target = new Date(`${MEMBEROF_RETIREMENT_DATE}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target.getTime() - today) / 86_400_000);
}

// ─── Graph reads ────────────────────────────────────────────────────────────

const GROUP_SELECT =
  "id,displayName,description,groupTypes,membershipRule,membershipRuleProcessingState,createdDateTime,securityEnabled,mailEnabled";

/**
 * All dynamic groups in the tenant. Uses the server-side groupTypes filter when
 * the tenant accepts it, and falls back to reading every group and filtering
 * locally when it doesn't.
 */
async function fetchDynamicGroups(): Promise<DynamicGroup[]> {
  try {
    return await graphGetAll<DynamicGroup>(
      `/groups?$filter=groupTypes/any(c:c eq 'DynamicMembership')&$select=${GROUP_SELECT}&$top=999`
    );
  } catch {
    const all = await graphGetAll<DynamicGroup>(`/groups?$select=${GROUP_SELECT}&$top=999`);
    return all.filter((g) => (g.groupTypes ?? []).includes("DynamicMembership"));
  }
}

/** All administrative units, including their membership rule where set. */
async function fetchAdministrativeUnits(): Promise<AdministrativeUnit[]> {
  const path =
    "/directory/administrativeUnits?$select=id,displayName,description,membershipType," +
    "membershipRule,membershipRuleProcessingState,visibility&$top=100";
  try {
    return await graphGetAll<AdministrativeUnit>(path);
  } catch {
    // Some tenants reject $select on this collection — retry without it.
    return graphGetAll<AdministrativeUnit>("/directory/administrativeUnits?$top=100");
  }
}

/** Reads the groups referenced by the rules, at a modest concurrency. */
async function fetchReferencedGroups(
  ids: string[],
  known: Map<string, DynamicGroup>
): Promise<Map<string, ReferencedGroup>> {
  const out = new Map<string, ReferencedGroup>();
  const toFetch: string[] = [];

  for (const id of ids) {
    const hit = known.get(id);
    if (hit) {
      out.set(id, {
        id,
        displayName: hit.displayName ?? id,
        exists: true,
        isDynamic: (hit.groupTypes ?? []).includes("DynamicMembership"),
        membershipRule: hit.membershipRule ?? null,
        usesMemberOf: usesMemberOf(hit.membershipRule),
      });
    } else {
      toFetch.push(id);
    }
  }

  let idx = 0;
  const worker = async () => {
    while (idx < toFetch.length) {
      const id = toFetch[idx++];
      try {
        const g = await graphGet<DynamicGroup>(`/groups/${id}?$select=${GROUP_SELECT}`);
        out.set(id, {
          id,
          displayName: g.displayName ?? id,
          exists: true,
          isDynamic: (g.groupTypes ?? []).includes("DynamicMembership"),
          membershipRule: g.membershipRule ?? null,
          usesMemberOf: usesMemberOf(g.membershipRule),
        });
      } catch {
        // 404 (deleted), or no read rights on that particular object.
        out.set(id, {
          id,
          displayName: id,
          exists: false,
          isDynamic: false,
          membershipRule: null,
          usesMemberOf: false,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, toFetch.length) }, worker));

  return out;
}

// ─── Rewrite suggestion ─────────────────────────────────────────────────────

interface Suggestion {
  rule: string | null;
  kind: RemediationKind;
  notes: string[];
}

/**
 * Tries to rewrite the rule without memberOf by inlining each source group's own
 * rule: `-any` becomes OR, `-all` becomes AND. Bails out — on purpose — for
 * anything it cannot prove equivalent, because a wrong rule silently changes who
 * gets which policy.
 */
function buildSuggestion(
  rule: string,
  clauses: MemberOfClause[],
  refs: Map<string, ReferencedGroup>
): Suggestion {
  const notes: string[] = [];

  if (clauses.some((c) => c.groupIds.some((id) => !refs.get(id)?.exists))) {
    notes.push(
      "The rule references a group that could not be read — it was most likely deleted, " +
        "which means this clause already matches nobody. Remove the clause or point it at a live group."
    );
    return { rule: null, kind: "brokenReference", notes };
  }

  const allRefs = clauses.flatMap((c) => c.groupIds.map((id) => refs.get(id)!));

  if (allRefs.some((r) => r.usesMemberOf)) {
    notes.push(
      "A source group is itself driven by a memberOf rule. Migrate the innermost rule first, " +
        "then come back to this one — the chain has to be unwound from the inside out."
    );
    return { rule: null, kind: "nestedChain", notes };
  }

  const staticRefs = allRefs.filter((r) => !r.isDynamic || !r.membershipRule);
  if (staticRefs.length > 0) {
    notes.push(
      `Source ${staticRefs.length === 1 ? "group" : "groups"} ${staticRefs
        .map((r) => `"${r.displayName}"`)
        .join(", ")} ${staticRefs.length === 1 ? "has" : "have"} assigned (static) membership, ` +
        "so there is no rule to inline and the replacement has to be written by hand. Look for a " +
        "directory attribute the source members already share — department, jobTitle, an extension " +
        "attribute — and rebuild the rule on that. Where the nesting only existed to narrow an " +
        "Intune assignment, an assignment filter on the assignment itself does the same job without " +
        "a second group."
    );
    return { rule: null, kind: "manual", notes };
  }

  const unsafe = clauses.filter(
    (c) => c.negated || c.quantifier === "unknown" || c.groupIds.length === 0
  );
  if (unsafe.length > 0) {
    notes.push(
      "This rule uses a negated or non-standard memberOf clause. Flattening it automatically " +
        "risks inverting who is in scope, so it needs a manual rewrite."
    );
    return { rule: null, kind: "manual", notes };
  }

  // `-any` means "in at least one of these groups" → OR; `-all` → AND.
  const rewritten = replaceClauses(rule, clauses, (clause) => {
    const joiner = clause.quantifier === "all" ? " and " : " or ";
    return `(${clause.groupIds
      .map((id) => `(${refs.get(id)!.membershipRule!.trim()})`)
      .join(joiner)})`;
  });

  for (const clause of clauses) {
    for (const id of clause.groupIds) {
      const ref = refs.get(id)!;
      const refSubj = ruleSubject(ref.membershipRule!);
      if (clause.subject !== "unknown" && refSubj !== "unknown" && refSubj !== clause.subject) {
        notes.push(
          `"${ref.displayName}" is a ${refSubj} rule but it is inlined into a ${clause.subject} ` +
            "clause. Verify the result — a device rule cannot select users, or the other way around."
        );
      }
    }
  }

  if (rewritten.length > MAX_RULE_LENGTH) {
    notes.push(
      `The flattened rule is ${rewritten.length} characters, over the ${MAX_RULE_LENGTH}-character ` +
        "limit for a membership rule. Split the group or simplify the source rules."
    );
  }

  notes.push(
    "Validate the rewritten rule with the rule builder's \"Validate Rules\" tab before saving, " +
      "and expect a re-evaluation pass over the whole group after the change."
  );

  return { rule: rewritten, kind: "inlineRewrite", notes };
}

// ─── Scan ───────────────────────────────────────────────────────────────────

export interface MemberOfScanResult {
  findings: MemberOfFinding[];
  /** Totals for context: how much of the tenant was looked at. */
  dynamicGroupCount: number;
  dynamicAuCount: number;
  /** Set when administrative units could not be read (missing rights). */
  auError: string | null;
}

function severityFor(
  processingState: string,
  remediation: RemediationKind,
  policies: ImpactedPolicy[] | null
): Severity {
  if (processingState.toLowerCase() === "paused") return "low";
  if (remediation === "brokenReference" || remediation === "nestedChain") return "high";
  if (policies && policies.length > 0) return "high";
  if (policies === null) return "medium";
  return "medium";
}

export type MemberOfProgress = (phase: string) => void;

/**
 * Finds every dynamic group and administrative unit whose membership rule uses
 * memberOf. Intune impact is left unresolved here — call `attachIntuneImpact`
 * for that, so the caller decides whether a full tenant scan is worth it.
 */
export async function scanMemberOfUsage(onProgress?: MemberOfProgress): Promise<MemberOfScanResult> {
  onProgress?.("Reading dynamic groups…");
  const groups = await fetchDynamicGroups();

  onProgress?.("Reading administrative units…");
  let units: AdministrativeUnit[] = [];
  let auError: string | null = null;
  try {
    units = await fetchAdministrativeUnits();
  } catch (e) {
    auError = e instanceof Error ? e.message : String(e);
  }

  const dynamicAus = units.filter(
    (u) => (u.membershipType ?? "").toLowerCase() === "dynamic" && u.membershipRule
  );

  const hitGroups = groups.filter((g) => usesMemberOf(g.membershipRule));
  const hitAus = dynamicAus.filter((u) => usesMemberOf(u.membershipRule));

  // Parse first so we know which groups the rules point at, then read those once.
  const parsed = [
    ...hitGroups.map((g) => ({
      kind: "group" as const,
      id: g.id,
      displayName: g.displayName ?? g.id,
      description: g.description ?? "",
      rule: g.membershipRule ?? "",
      processingState: g.membershipRuleProcessingState ?? "On",
      createdDateTime: g.createdDateTime ?? null,
      clauses: parseMemberOfClauses(g.membershipRule ?? ""),
    })),
    ...hitAus.map((u) => ({
      kind: "administrativeUnit" as const,
      id: u.id,
      displayName: u.displayName ?? u.id,
      description: u.description ?? "",
      rule: u.membershipRule ?? "",
      processingState: u.membershipRuleProcessingState ?? "On",
      createdDateTime: null,
      clauses: parseMemberOfClauses(u.membershipRule ?? ""),
    })),
  ];

  const referencedIds = [...new Set(parsed.flatMap((p) => p.clauses.flatMap((c) => c.groupIds)))];

  if (referencedIds.length > 0) onProgress?.(`Resolving ${referencedIds.length} referenced groups…`);
  const knownById = new Map(groups.map((g) => [g.id.toLowerCase(), g]));
  const refs = await fetchReferencedGroups(referencedIds, knownById);

  const findings: MemberOfFinding[] = parsed.map((p) => {
    const suggestion = buildSuggestion(p.rule, p.clauses, refs);
    return {
      kind: p.kind,
      id: p.id,
      displayName: p.displayName,
      description: p.description,
      membershipRule: p.rule,
      processingState: p.processingState,
      createdDateTime: p.createdDateTime,
      clauses: p.clauses,
      referenced: [...new Set(p.clauses.flatMap((c) => c.groupIds))].map(
        (id) =>
          refs.get(id) ?? {
            id,
            displayName: id,
            exists: false,
            isDynamic: false,
            membershipRule: null,
            usesMemberOf: false,
          }
      ),
      remediation: suggestion.kind,
      suggestedRule: suggestion.rule,
      notes: suggestion.notes,
      // Administrative units are never an Intune assignment target, so their
      // impact list is empty rather than pending — they break role scoping, not
      // policy delivery.
      policies: p.kind === "administrativeUnit" ? [] : null,
      severity: "medium",
    };
  });

  for (const f of findings) {
    f.severity = severityFor(f.processingState, f.remediation, f.policies);
  }

  onProgress?.("");
  return {
    findings: sortFindings(findings),
    dynamicGroupCount: groups.length,
    dynamicAuCount: dynamicAus.length,
    auError,
  };
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function sortFindings(findings: MemberOfFinding[]): MemberOfFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.policies?.length ?? 0) - (a.policies?.length ?? 0) ||
      a.displayName.localeCompare(b.displayName)
  );
}

/**
 * Fills in which Intune policies target each affected group, reusing the shared
 * tenant assignment scan. Returns a new array; the input is left alone.
 */
export async function attachIntuneImpact(
  findings: MemberOfFinding[],
  onProgress?: ScanProgress
): Promise<MemberOfFinding[]> {
  const records = await getAssignments(onProgress);

  const byGroup = new Map<string, AssignmentRecord[]>();
  for (const r of records) {
    if (r.targetKind !== "group" || !r.groupId) continue;
    const key = r.groupId.toLowerCase();
    const list = byGroup.get(key);
    if (list) list.push(r);
    else byGroup.set(key, [r]);
  }

  const enriched = findings.map((f) => {
    if (f.kind === "administrativeUnit") return { ...f, policies: [] };
    const hits = byGroup.get(f.id.toLowerCase()) ?? [];
    const policies: ImpactedPolicy[] = hits.map((r) => ({
      policyId: r.policyId,
      policyName: r.policyName,
      policyType: r.policyType,
      mode: r.mode,
    }));
    return {
      ...f,
      policies,
      severity: severityFor(f.processingState, f.remediation, policies),
    };
  });

  return sortFindings(enriched);
}

export { isAssignmentsCached };

// ─── Export ─────────────────────────────────────────────────────────────────

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Migration ticks, passed in from the progress store so this stays pure. */
export type CsvProgressLookup = (id: string) => { checked: boolean; done: boolean; updated: string };

/**
 * One row per finding, with the referenced groups and suggestion inline. The
 * status columns come first so the sheet doubles as a hand-over checklist.
 */
export function buildMemberOfCsv(
  findings: MemberOfFinding[],
  progress?: CsvProgressLookup
): string {
  const header = [
    "Status",
    "Marked on",
    "Object type",
    "Name",
    "Object ID",
    "Processing state",
    "Severity",
    "Remediation",
    "Referenced groups",
    "Intune policies affected",
    "Policy names",
    "Current rule",
    "Suggested rule",
    "Notes",
  ];

  const rows = findings.map((f) => {
    const p = progress?.(f.id);
    return [
    p?.done ? "Done" : p?.checked ? "Checked" : "Open",
    p?.updated ? p.updated.slice(0, 10) : "",
    f.kind === "group" ? "Group" : "Administrative unit",
    f.displayName,
    f.id,
    f.processingState,
    f.severity,
    remediationLabel(f.remediation),
    f.referenced.map((r) => `${r.displayName}${r.exists ? "" : " (missing)"}`).join(" | "),
    f.policies === null ? "not analysed" : f.policies.length,
    f.policies === null ? "" : [...new Set(f.policies.map((p) => p.policyName))].join(" | "),
    f.membershipRule,
    f.suggestedRule ?? "",
    f.notes.join(" "),
    ];
  });

  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
