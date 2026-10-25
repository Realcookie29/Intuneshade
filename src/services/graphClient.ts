import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance } from "../auth/msalInstance";
import { loginRequest } from "../auth/msalConfig";
import type { GraphListResponse } from "../types/graphTypes";

const BASE_URL = "https://graph.microsoft.com/beta";

/**
 * Acquires a Graph token. `scopes` lets a feature ask for extra (read) scopes on
 * demand — incremental consent — instead of adding them to the sign-in request
 * for every user. Graph tokens carry all scopes consented so far, so a token
 * fetched for extra scopes also works for the regular calls.
 */
async function getToken(scopes?: string[]): Promise<string> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) throw new Error("Not signed in");

  const req = scopes ? { scopes } : loginRequest;
  try {
    const result = await msalInstance.acquireTokenSilent({
      ...req,
      account: accounts[0],
    });
    return result.accessToken;
  } catch {
    const result = await msalInstance.acquireTokenPopup(req);
    return result.accessToken;
  }
}

/** sessionStorage key: the page to reopen after a consent redirect. */
export const RESUME_TOOL_KEY = "intuneshade.resumeTool";

/**
 * Makes sure extra scopes are consented before a feature starts calling Graph.
 * If consent is missing it redirects to Microsoft (popups need a redirect-bridge
 * page in MSAL v5 and time out without one) and returns "redirecting"; after
 * the round-trip the app reopens `resumeTool`.
 */
export async function ensureScopes(scopes: string[], resumeTool: string): Promise<"ok" | "redirecting"> {
  const account = msalInstance.getAllAccounts()[0];
  if (!account) throw new Error("Not signed in");
  try {
    await msalInstance.acquireTokenSilent({ scopes, account });
    return "ok";
  } catch (err) {
    if (!(err instanceof InteractionRequiredAuthError)) throw err;
    try { sessionStorage.setItem(RESUME_TOOL_KEY, resumeTool); } catch { /* ignore */ }
    await msalInstance.acquireTokenRedirect({ scopes, account });
    return "redirecting";
  }
}

async function request(method: string, path: string, body?: unknown, scopes?: string[]): Promise<unknown> {
  const token = await getToken(scopes);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Graph API ${method} ${path} → ${res.status}: ${text}`);
  }

  // Read body as text first — some endpoints return 200 with an empty body
  const text = await res.text();
  if (!text) return undefined;
  return JSON.parse(text);
}

export async function graphGet<T>(path: string, scopes?: string[]): Promise<T> {
  return request("GET", path, undefined, scopes) as Promise<T>;
}

/** GET an OData $count endpoint (requires the ConsistencyLevel: eventual header). */
export async function graphGetCount(path: string): Promise<number> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
  });
  if (!res.ok) throw new Error(`Graph API GET ${path} → ${res.status}`);
  const text = await res.text();
  return Number(text) || 0;
}

/** Fetches all pages and returns the concatenated value array. */
export async function graphGetAll<T>(path: string, scopes?: string[]): Promise<T[]> {
  const results: T[] = [];
  let nextPath: string | null = path;

  while (nextPath) {
    const url = nextPath.startsWith("https://")
      ? nextPath.replace("https://graph.microsoft.com/beta", "")
      : nextPath;

    const page = (await request("GET", url, undefined, scopes)) as GraphListResponse<T>;
    results.push(...(page.value ?? []));

    nextPath = page["@odata.nextLink"] ?? null;
  }

  return results;
}

export async function graphPost(path: string, body: unknown): Promise<void> {
  await request("POST", path, body);
}

export async function graphPostWithResponse<T>(path: string, body: unknown): Promise<T> {
  return request("POST", path, body) as Promise<T>;
}

export async function graphPatch(path: string, body: unknown): Promise<void> {
  await request("PATCH", path, body);
}

export async function graphDelete(path: string): Promise<void> {
  await request("DELETE", path);
}

let tenantNameCache: string | null = null;

/**
 * Returns the organization (tenant) display name from Graph, cached for the
 * session. This is the tenant's name — not the signed-in user — so it is what
 * belongs on reports. Returns "" if the org has no display name set.
 */
export async function getTenantName(): Promise<string> {
  if (tenantNameCache !== null) return tenantNameCache;
  const orgs = await graphGetAll<{ displayName?: string }>("/organization");
  const name = orgs[0]?.displayName?.trim() ?? "";
  tenantNameCache = name;
  return name;
}
