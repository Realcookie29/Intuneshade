// ─── Check context ────────────────────────────────────────────────────────────
// Evaluators read Graph only through this context. It caches identical GETs for
// the duration of one run (many checks share the same policies) and turns HTTP
// failures into a typed outcome, so an evaluator can say "missing permission"
// or "endpoint not available" instead of crashing.

import type { BreakGlassAccount, CheckResult, CheckState, Evidence } from "./types";

export type Fetched<T> =
  | { ok: true; data: T; path: string }
  | { ok: false; status: number; error: string; path: string };

/** Minimal Graph access the context needs — real client in the app, fixtures in tests. */
export interface GraphReader {
  get(path: string): Promise<unknown>;
  getAll(path: string): Promise<unknown[]>;
}

export interface CheckOptions {
  breakGlass: BreakGlassAccount[];
  /** Scan every user for per-user MFA (5.1.2.1) instead of privileged users only. */
  fullPerUserMfaScan: boolean;
}

export interface CheckContext {
  get<T>(path: string): Promise<Fetched<T>>;
  getAll<T>(path: string): Promise<Fetched<T[]>>;
  options: CheckOptions;
  /** Per-run memo for derived data shared between checks (privileged users, licences, …). */
  memo<T>(key: string, compute: () => Promise<T>): Promise<T>;
}

function statusOf(err: unknown): number {
  if (err && typeof err === "object" && "status" in err && typeof err.status === "number") return err.status;
  const m = String(err instanceof Error ? err.message : err).match(/→ (\d{3})/);
  return m ? Number(m[1]) : 0;
}

/** One-line reason without tokens or response bodies beyond Graph's own message. */
function reasonOf(err: unknown, status: number): string {
  const msg = err instanceof Error ? err.message : String(err);
  const inner = msg.match(/"message"\s*:\s*"([^"]{1,200})/)?.[1];
  if (status === 403) return `missing permission or licence${inner ? ` (${inner})` : ""}`;
  if (status === 401) return "not authorised — sign in again";
  if (status === 404) return "endpoint or object not found";
  if (status === 400) return `request not supported${inner ? ` (${inner})` : ""}`;
  return inner ?? msg.slice(0, 200);
}

export interface ContextHooks {
  /** Called once per network request (cache misses only), for the activity feed. */
  onRequest?: (path: string) => void;
}

export function createContext(reader: GraphReader, options: CheckOptions, hooks: ContextHooks = {}): CheckContext {
  const cache = new Map<string, Promise<Fetched<unknown>>>();
  const memos = new Map<string, Promise<unknown>>();

  function cached<T>(kind: "get" | "all", path: string): Promise<Fetched<T>> {
    const key = `${kind} ${path}`;
    let hit = cache.get(key);
    if (!hit) {
      hooks.onRequest?.(path);
      hit = (kind === "get" ? reader.get(path) : reader.getAll(path)).then(
        (data) => ({ ok: true as const, data, path }),
        (err) => {
          const status = statusOf(err);
          return { ok: false as const, status, error: reasonOf(err, status), path };
        },
      );
      cache.set(key, hit);
    }
    return hit as Promise<Fetched<T>>;
  }

  return {
    get: (path) => cached("get", path),
    getAll: (path) => cached("all", path),
    options,
    memo: <T,>(key: string, compute: () => Promise<T>) => {
      let m = memos.get(key);
      if (!m) {
        m = compute();
        memos.set(key, m);
      }
      return m as Promise<T>;
    },
  };
}

// ─── Result helpers ───────────────────────────────────────────────────────────

export function result(
  id: string,
  expected: string,
  state: CheckState,
  actual: string,
  message: string,
  evidence: Evidence[] = [],
  table?: CheckResult["table"],
): CheckResult {
  return { id, state, actual, expected, evidence, message, table };
}

/** A failed fetch as a result: 400/404 on beta endpoints degrades to Manual, everything else is Error. */
export function fetchFailure(id: string, expected: string, f: { status: number; error: string; path: string }, beta = false): CheckResult {
  if (beta && (f.status === 400 || f.status === 404)) {
    return result(id, expected, "Manual", "unknown", `Beta endpoint not available (${f.error}). Verify in the portal.`,
      [{ source: f.path, path: "", value: `HTTP ${f.status}` }]);
  }
  return result(id, expected, "Error", "unknown", `Could not read ${f.path}: ${f.error}.`,
    [{ source: f.path, path: "", value: `HTTP ${f.status}` }]);
}

/** Reads a dotted property path, e.g. "defaultUserRolePermissions.allowedToCreateApps". */
export function prop(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

/** Graph policy endpoints sometimes return a collection where a singleton is expected. */
export function single<T>(data: unknown): T {
  const v = data as { value?: T[] };
  return (Array.isArray(v?.value) ? v.value[0] : data) as T;
}

/** ISO-8601 duration ("P180D", "P1Y", "PT12H") to days. Returns NaN when unparsable. */
export function isoDays(duration: unknown): number {
  if (typeof duration !== "string") return NaN;
  const m = duration.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return NaN;
  const [, y, mo, w, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return y * 365 + mo * 30 + w * 7 + d + h / 24 + mi / 1440 + s / 86400;
}

/** Runs async work over items with limited parallelism (keeps Graph throttling away). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
