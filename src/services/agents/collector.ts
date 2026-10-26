// ─── Collector agent ──────────────────────────────────────────────────────────
// Builds the per-run check context on top of the real Graph client and reads
// the endpoints most checks share, so the Assessor mostly hits the cache.
// Read-only: only GET requests are ever made.

import { graphGet, graphGetAll } from "../graphClient";
import { createContext, type CheckContext, type CheckOptions } from "../../baseline/context";
import type { SharedSource } from "../../baseline";

export interface CollectorHooks {
  onRequest: (path: string) => void;
  onSource: (index: number, total: number, label: string) => void;
  onSourceDone: (label: string, ok: boolean, detail: string) => void;
  signal?: AbortSignal;
}

/** `scopes` = sign-in scopes plus the extra scopes of the selected checks. */
export function createGraphContext(options: CheckOptions, scopes: string[], onRequest: (path: string) => void): CheckContext {
  return createContext(
    {
      get: (path) => graphGet(path, scopes),
      getAll: (path) => graphGetAll(path, scopes),
    },
    options,
    { onRequest },
  );
}

/** Warms the context cache with the shared sources and reports each one. Returns how many were readable. */
export async function collectShared(ctx: CheckContext, sources: SharedSource[], hooks: CollectorHooks): Promise<number> {
  let ok = 0;
  for (const [i, src] of sources.entries()) {
    if (hooks.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    hooks.onSource(i, sources.length, src.label);
    const r = src.all ? await ctx.getAll<unknown>(src.path) : await ctx.get<unknown>(src.path);
    if (r.ok) {
      ok++;
      hooks.onSourceDone(src.label, true, Array.isArray(r.data) ? `${r.data.length} item${r.data.length === 1 ? "" : "s"}` : "read");
    } else {
      hooks.onSourceDone(src.label, false, r.error);
    }
  }
  return ok;
}
