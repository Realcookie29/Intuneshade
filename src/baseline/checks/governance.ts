// ─── ID Governance: access reviews and PIM approval (5.3.x) ───────────────────

import type { CheckContext } from "../context";
import { fetchFailure, result } from "../context";
import type { CheckResult } from "../types";
import { ROLE_GLOBAL_ADMIN, ROLE_PRIVILEGED_ROLE_ADMIN } from "./roles";

type Check = (ctx: CheckContext, id: string, expected: string) => Promise<CheckResult>;

export const ACCESS_REVIEWS = "/v1.0/identityGovernance/accessReviews/definitions";

interface ReviewDefinition {
  displayName: string;
  status?: string;
  scope?: unknown;
  instanceEnumerationScope?: unknown;
  settings?: { recurrence?: { pattern?: { type?: string } } | null };
}

function reviewCheck(matches: (scopeText: string) => boolean, what: string, requireRecurring: boolean): Check {
  return async (ctx, id, expected) => {
    const r = await ctx.getAll<ReviewDefinition>(ACCESS_REVIEWS);
    if (!r.ok) {
      const f = fetchFailure(id, expected, r);
      return r.status === 403 ? { ...f, message: `${f.message} Access reviews need Entra ID P2 / ID Governance and AccessReview.Read.All.` } : f;
    }
    const active = r.data.filter((d) => d.status !== "Completed");
    const hits = active.filter((d) => matches(JSON.stringify([d.scope, d.instanceEnumerationScope]).toLowerCase()));
    const good = requireRecurring ? hits.filter((d) => !!d.settings?.recurrence?.pattern?.type) : hits;
    const ev = [{ source: ACCESS_REVIEWS, path: `active definitions ${what}`, value: hits.map((d) => d.displayName) }];
    if (good.length) return result(id, expected, "Pass", `${good.length} review(s)`, `Reviewed by ${good.map((d) => `"${d.displayName}"`).join(", ")}.`, ev);
    if (hits.length) return result(id, expected, "Partial", `${hits.length} one-off review(s)`, `Only one-off reviews ${what}; make them recurring.`, ev);
    return result(id, expected, "Fail", "none", `No active access review ${what}.`, ev);
  };
}

interface Rule {
  id: string;
  "@odata.type"?: string;
  isEnabled?: boolean;
  setting?: { isApprovalRequired?: boolean; approvalStages?: Array<{ primaryApprovers?: unknown[] }> };
}

function pimApproval(roleId: string, roleName: string): Check {
  const path = `/v1.0/policies/roleManagementPolicyAssignments?$filter=scopeId eq '/' and scopeType eq 'DirectoryRole' and roleDefinitionId eq '${roleId}'&$expand=policy($expand=rules)`;
  return async (ctx, id, expected) => {
    const r = await ctx.getAll<{ policy?: { rules?: Rule[] } }>(path);
    if (!r.ok) return fetchFailure(id, expected, r);
    const rules = r.data[0]?.policy?.rules ?? [];
    const approval = rules.find((x) => x.id === "Approval_EndUser_Assignment");
    const required = approval?.setting?.isApprovalRequired === true;
    const approvers = approval?.setting?.approvalStages?.reduce((n, s) => n + (s.primaryApprovers?.length ?? 0), 0) ?? 0;
    const authContext = rules.find((x) => x.id === "AuthenticationContext_EndUser_Assignment")?.isEnabled === true;
    const ev = [
      { source: path, path: "rules[Approval_EndUser_Assignment].setting.isApprovalRequired", value: approval?.setting?.isApprovalRequired ?? null },
      { source: path, path: "approvers", value: approvers },
    ];
    // An authentication context on activation is good practice but is not approval.
    const info = authContext ? " Info: an authentication context is required on activation (this does not count as approval)." : "";
    if (required && approvers >= 1) return result(id, expected, "Pass", `approval required, ${approvers} approver(s)`, `${roleName} activation requires approval.${info}`, ev);
    if (required) return result(id, expected, "Partial", "approval required, no approvers", `Approval is required but no approvers are set (falls back to Privileged Role Administrators).${info}`, ev);
    return result(id, expected, "Fail", "no approval", `${roleName} can be activated without approval.${info}`, ev);
  };
}

export const GOVERNANCE_CHECKS: Record<string, Check> = {
  "5.3.2": reviewCheck((s) => s.includes("usertype eq 'guest'"), "of guest users", true),
  "5.3.3": reviewCheck((s) => s.includes("roleassignmentscheduleinstances"), "of privileged role assignments", false),
  "5.3.4": pimApproval(ROLE_GLOBAL_ADMIN, "Global Administrator"),
  "5.3.5": pimApproval(ROLE_PRIVILEGED_ROLE_ADMIN, "Privileged Role Administrator"),
};
