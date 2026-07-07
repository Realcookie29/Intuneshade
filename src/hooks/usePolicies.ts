import { useState, useEffect, useCallback } from "react";
import type { PolicyType, PolicyRow } from "../types/policyTypes";
import { fetchPolicies } from "../services/policiesService";
import { buildPolicyRows } from "../utils/assignmentHelpers";
import { getGroupMap, getFilterMap } from "./useGroups";

// Session cache of built rows per policy type. Kept until the user hits Refresh
// (or mutates a policy, which clears the affected type). Navigating between tabs
// re-uses the cache instead of refetching.
const policyCache = new Map<PolicyType, PolicyRow[]>();

/** Clears one (or all) cached policy types — call after tenant-side mutations. */
export function invalidatePolicyCache(type?: PolicyType): void {
  if (type) policyCache.delete(type);
  else policyCache.clear();
}

interface UsePoliciesResult {
  rows: PolicyRow[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePolicies(policyType: PolicyType | null): UsePoliciesResult {
  const [rows, setRows] = useState<PolicyRow[]>(policyType ? policyCache.get(policyType) ?? [] : []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Refresh drops this type's cache so the effect refetches fresh data.
  const refresh = useCallback(() => {
    if (policyType) policyCache.delete(policyType);
    setTick((t) => t + 1);
  }, [policyType]);

  useEffect(() => {
    if (!policyType) {
      setRows([]);
      return;
    }

    const cached = policyCache.get(policyType);
    if (cached) {
      setRows(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchPolicies(policyType)
      .then((policies) => {
        if (cancelled) return;
        const gMap = getGroupMap();
        const fMap = getFilterMap();
        const allRows = policies.flatMap((p) => buildPolicyRows(p, gMap, fMap));
        policyCache.set(policyType, allRows);
        setRows(allRows);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [policyType, tick]);

  return { rows, isLoading, error, refresh };
}
