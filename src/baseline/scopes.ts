// ─── Graph permissions per check ──────────────────────────────────────────────
// Extra delegated scopes each check needs on top of the sign-in scopes
// (Directory.Read.All and the Intune read scopes). A benchmark only requests the
// scopes of the checks the admin selected — least privilege, and fewer
// admin-consent hurdles for a partial scan.

const POLICY = "Policy.Read.All";
const ROLES = "RoleManagement.Read.Directory";
const PIM_POLICY = "RoleManagementPolicy.Read.Directory";
const AUDIT = "AuditLog.Read.All";
const AUTH_METHODS = "UserAuthenticationMethod.Read.All";
const REVIEWS = "AccessReview.Read.All";
const SYNC = "OnPremDirectorySynchronization.Read.All";

export const CHECK_SCOPES: Record<string, string[]> = {
  "1.1.1": [ROLES],
  "1.1.2": [POLICY],
  "1.1.3": [ROLES],
  "1.1.4": [ROLES],
  "2.2.1": [],
  "4.1": [],
  "4.2": [],
  "5.1.2.1": [ROLES, AUTH_METHODS],
  "5.1.2.2": [POLICY],
  "5.1.2.3": [POLICY],
  "5.1.2.4": [POLICY],
  "5.1.3.1": [POLICY],
  "5.1.3.3": [],
  "5.1.4.2": [POLICY],
  "5.1.4.3": [POLICY],
  "5.1.4.4": [POLICY],
  "5.1.4.5": [POLICY],
  "5.1.5.2": [POLICY],
  "5.1.5.4": [POLICY],
  "5.1.5.5": [POLICY],
  "5.1.5.6": [POLICY],
  "5.1.6.2": [POLICY],
  "5.1.8.1": [SYNC],
  "5.2.2.1": [POLICY, ROLES],
  "5.2.2.2": [POLICY],
  "5.2.2.3": [POLICY],
  "5.2.2.4": [POLICY],
  "5.2.2.6": [POLICY],
  "5.2.2.7": [POLICY],
  "5.2.2.9": [POLICY],
  "5.2.2.10": [POLICY],
  "5.2.2.11": [POLICY],
  "5.2.2.12": [POLICY],
  "5.2.2.13": [POLICY],
  "5.2.2.17": [POLICY],
  "5.2.3.1": [POLICY],
  "5.2.3.2": [],
  "5.2.3.3": [],
  "5.2.3.4": [AUDIT, AUTH_METHODS],
  "5.2.3.5": [POLICY],
  "5.2.3.6": [POLICY],
  "5.2.3.8": [],
  "5.2.3.9": [],
  "5.2.3.10": [POLICY],
  "5.2.4.1": [],
  "5.2.4.3": [],
  "5.2.4.4": [],
  "5.2.4.5": [],
  "5.3.2": [REVIEWS],
  "5.3.3": [REVIEWS],
  "5.3.4": [PIM_POLICY],
  "5.3.5": [PIM_POLICY],
};

/** Extra scopes (beyond sign-in) needed for the given checks, sorted and de-duplicated. */
export function extraScopesFor(ids: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const id of ids) for (const s of CHECK_SCOPES[id] ?? []) out.add(s);
  return [...out].sort();
}
