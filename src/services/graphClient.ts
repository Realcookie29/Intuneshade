import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance } from "../auth/msalInstance";
import { WRITE_SCOPES, loginRequest } from "../auth/msalConfig";
import type { GraphListResponse } from "../types/graphTypes";

const GRAPH_ROOT = "https://graph.microsoft.com";
const BASE_URL = `${GRAPH_ROOT}/beta`;

/**
 * Resolves a request path to a full URL. Paths default to /beta (the app's
 * historical base); a path may also name its version explicitly
 * ("/v1.0/…" or "/beta/…"), or be a full Graph URL such as an @odata.nextLink.
 */
function toUrl(path: string): string {
  if (path.startsWith(`${GRAPH_ROOT}/`)) return path;
  if (path.startsWith("/v1.0/") || path.startsWith("/beta/")) return `${GRAPH_ROOT}${path}`;
  return `${BASE_URL}${path}`;
}

/** A failed Graph call. `status` lets callers tell missing permissions (403) from absent endpoints (400/404). */
export class GraphError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(method: string, path: string, status: number, body: string) {
    super(`Graph API ${method} ${path} → ${status}: ${body}`);
    this.name = "GraphError";
    this.status = status;
    this.path = path;
  }
}

const RETRY_STATUS = new Set([429, 503, 504]);
const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(toUrl(path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // Throttled or briefly unavailable: wait as instructed (Retry-After, seconds) and retry.
    if (!RETRY_STATUS.has(res.status) || attempt >= MAX_RETRIES) break;
    const retryAfter = Number(res.headers.get("Retry-After"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** attempt);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new GraphError(method, path, res.status, text);
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
  const res = await fetch(toUrl(path), {
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
    // nextLinks are absolute URLs; toUrl passes them through with their own version.
    const page = (await request("GET", nextPath, undefined, scopes)) as GraphListResponse<T>;
    results.push(...(page.value ?? []));

    nextPath = page["@odata.nextLink"] ?? null;
  }

  return results;
}

/** The page shown right now — reopened after a consent redirect. Set by AppShell. */
let activeTool = "home";
export function setActiveTool(tool: string) {
  activeTool = tool;
}

/** Thrown when a write needs consent first and the app is navigating to Microsoft. */
export class ConsentRedirectError extends Error {
  constructor() {
    super("Microsoft is asking for write permission. Repeat the action after you return.");
    this.name = "ConsentRedirectError";
  }
}

/** Every tenant write goes through here: write scopes are requested on first use. */
async function write(method: string, path: string, body?: unknown): Promise<unknown> {
  if ((await ensureScopes(WRITE_SCOPES, activeTool)) === "redirecting") throw new ConsentRedirectError();
  return request(method, path, body, WRITE_SCOPES);
}

/** POST for read-only actions such as /directoryObjects/getByIds — no write scopes. */
export async function graphPostRead<T>(path: string, body: unknown): Promise<T> {
  return request("POST", path, body) as Promise<T>;
}

export async function graphPost(path: string, body: unknown): Promise<void> {
  await write("POST", path, body);
}

export async function graphPostWithResponse<T>(path: string, body: unknown): Promise<T> {
  return write("POST", path, body) as Promise<T>;
}

export async function graphPatch(path: string, body: unknown): Promise<void> {
  await write("PATCH", path, body);
}

export async function graphDelete(path: string): Promise<void> {
  await write("DELETE", path);
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

const jwtExp = (jwt: string): number => {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return payload.exp ?? 0;
  } catch {
    return 0;
  }
};

/**
 * The signed-in user's Entra ID token (audience = this app). The AI proxy
 * requires it, so only signed-in IntuneShade users can use the proxy. An ID token
 * close to expiry is refreshed through the refresh token.
 */
export async function getIdToken(): Promise<string> {
  const account = msalInstance.getAllAccounts()[0];
  if (!account) throw new Error("Not signed in");
  let result = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
  if (jwtExp(result.idToken) * 1000 < Date.now() + 120_000) {
    result = await msalInstance.acquireTokenSilent({ ...loginRequest, account, forceRefresh: true });
  }
  return result.idToken;
}
