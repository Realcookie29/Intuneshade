import { graphGet } from "./graphClient";
import type { AuditEvent, GraphListResponse } from "../types/graphTypes";

/**
 * Fetches recent Intune audit events (policy/assignment/app changes), newest
 * first. Stops paging once maxEvents is reached so busy tenants don't pull
 * tens of thousands of records.
 */
export async function fetchAuditEvents(maxEvents = 500): Promise<AuditEvent[]> {
  const pageSize = Math.min(maxEvents, 200);
  const results: AuditEvent[] = [];
  let path: string | null =
    `/deviceManagement/auditEvents?$orderby=activityDateTime desc&$top=${pageSize}`;

  while (path && results.length < maxEvents) {
    const url: string = path.startsWith("https://")
      ? path.replace("https://graph.microsoft.com/beta", "")
      : path;
    const page = await graphGet<GraphListResponse<AuditEvent>>(url);
    results.push(...(page.value ?? []));
    path = page["@odata.nextLink"] ?? null;
  }

  return results.slice(0, maxEvents);
}
