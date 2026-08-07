/**
 * Parsing of Entra ID dynamic membership rules, specifically the `memberOf`
 * operator that is being retired.
 *
 * Kept free of any Graph or React import so it stays a pure, testable unit —
 * the scanning and remediation logic lives in `services/memberOfScanService.ts`.
 */

/** Maximum length Entra accepts for a membershipRule. */
export const MAX_RULE_LENGTH = 3072;

const GUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

/**
 * Blanks out the *contents* of quoted literals while preserving the string's
 * length, so offsets found in the masked copy still line up with the original.
 * Without this, a rule like `user.jobTitle -eq "memberOf"` would be reported as
 * a hit, and a `)` inside a literal would break paren matching.
 */
export function maskLiterals(rule: string): string {
  return rule.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, (m) =>
    m.length <= 2 ? m : m[0] + " ".repeat(m.length - 2) + m[m.length - 1]
  );
}

/** True if the rule actually uses the memberOf operator (literals ignored). */
export function usesMemberOf(rule: string | null | undefined): boolean {
  if (!rule) return false;
  return /\bmemberOf\b/i.test(maskLiterals(rule));
}

/** Index of the `)` closing the `(` at openIdx, or -1 when unbalanced. */
function matchingParen(masked: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    const c = masked[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export interface MemberOfClause {
  /** The clause exactly as it appears in the rule. */
  raw: string;
  /** Character offsets into the original rule, for highlighting and rewriting. */
  start: number;
  end: number;
  subject: "user" | "device" | "unknown";
  quantifier: "any" | "all" | "unknown";
  /** The clause excludes rather than includes (-notIn / -ne / -notContains). */
  negated: boolean;
  /** Referenced group object IDs, lower-cased and de-duplicated. */
  groupIds: string[];
}

/**
 * Extracts every `<subject>.memberOf -any/-all (...)` clause from a rule.
 * Deliberately tolerant: clauses that don't match the documented shape are still
 * returned, just flagged `unknown`, so nothing gets silently dropped.
 */
export function parseMemberOfClauses(rule: string): MemberOfClause[] {
  const masked = maskLiterals(rule);
  const clauses: MemberOfClause[] = [];
  const re = /\bmemberOf\b/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(masked)) !== null) {
    const kwStart = m.index;
    const kwEnd = kwStart + m[0].length;

    // Subject sits immediately before, e.g. "user." in "user.memberOf".
    const subjMatch = /([A-Za-z]+)\s*\.\s*$/.exec(masked.slice(0, kwStart));
    const subjWord = subjMatch?.[1].toLowerCase();
    const subject: MemberOfClause["subject"] =
      subjWord === "user" ? "user" : subjWord === "device" ? "device" : "unknown";
    const start = subjMatch ? kwStart - subjMatch[0].length : kwStart;

    // Quantifier and the parenthesised predicate that follows it.
    const qMatch = /^\s*-(any|all)\b/i.exec(masked.slice(kwEnd));
    const quantifier = qMatch ? (qMatch[1].toLowerCase() as "any" | "all") : "unknown";

    const openIdx = masked.indexOf("(", kwEnd);
    // Only treat that paren as ours if nothing but the quantifier sits between.
    const ownsParen = openIdx !== -1 && /^\s*(-(any|all))?\s*$/i.test(masked.slice(kwEnd, openIdx));
    const closeIdx = ownsParen ? matchingParen(masked, openIdx) : -1;

    const end = closeIdx !== -1 ? closeIdx + 1 : kwEnd;
    const predicate = closeIdx !== -1 ? rule.slice(openIdx + 1, closeIdx) : "";
    const maskedPredicate = closeIdx !== -1 ? masked.slice(openIdx + 1, closeIdx) : "";

    clauses.push({
      raw: rule.slice(start, end),
      start,
      end,
      subject,
      quantifier,
      negated: /-(notIn|ne|notContains|notStartsWith|notMatch)\b/i.test(maskedPredicate),
      groupIds: [...new Set((predicate.match(GUID_RE) ?? []).map((g) => g.toLowerCase()))],
    });

    // Resume after this clause so a nested memberOf isn't reported twice.
    re.lastIndex = Math.max(end, kwEnd);
  }

  return clauses;
}

/** Which object type a rule is written against, judged by its property prefixes. */
export function ruleSubject(rule: string): "user" | "device" | "mixed" | "unknown" {
  const masked = maskLiterals(rule);
  const user = /\buser\s*\./i.test(masked);
  const device = /\bdevice\s*\./i.test(masked);
  if (user && device) return "mixed";
  if (user) return "user";
  if (device) return "device";
  return "unknown";
}

/**
 * Replaces every memberOf clause in `rule` with the given text, working
 * back-to-front so earlier offsets stay valid.
 */
export function replaceClauses(
  rule: string,
  clauses: MemberOfClause[],
  replacement: (clause: MemberOfClause) => string
): string {
  let out = rule;
  for (const clause of [...clauses].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, clause.start) + replacement(clause) + out.slice(clause.end);
  }
  return out;
}
