import { useState, useEffect, useCallback } from "react";
import type { GraphGroup, AssignmentFilter } from "../types/graphTypes";
import { fetchAllGroups, fetchAssignmentFilters } from "../services/policiesService";

// Module-level cache — fetched once per browser session
let cachedGroups: GraphGroup[] | null = null;
let cachedFilters: AssignmentFilter[] | null = null;
let groupMap: Map<string, string> | null = null;
let filterMap: Map<string, string> | null = null;

export function getGroupMap(): Map<string, string> {
  return groupMap ?? new Map();
}

export function getFilterMap(): Map<string, string> {
  return filterMap ?? new Map();
}

/** Merge freshly resolved group id→name pairs into the shared cache. */
export function mergeGroupNames(names: Map<string, string>): void {
  if (!groupMap) groupMap = new Map();
  for (const [id, name] of names) groupMap.set(id, name);
}

interface UseGroupsResult {
  groups: GraphGroup[];
  filters: AssignmentFilter[];
  isLoading: boolean;
  error: string | null;
  search: (query: string) => GraphGroup[];
}

export function useGroups(): UseGroupsResult {
  const [groups, setGroups] = useState<GraphGroup[]>(cachedGroups ?? []);
  const [filters, setFilters] = useState<AssignmentFilter[]>(cachedFilters ?? []);
  const [isLoading, setIsLoading] = useState(!cachedGroups);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedGroups) return;

    let cancelled = false;
    setIsLoading(true);

    Promise.all([fetchAllGroups(), fetchAssignmentFilters()])
      .then(([g, f]) => {
        if (cancelled) return;
        cachedGroups = g;
        cachedFilters = f;
        groupMap = new Map(g.map((x) => [x.id, x.displayName]));
        filterMap = new Map(f.map((x) => [x.id, x.displayName]));
        setGroups(g);
        setFilters(f);
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
  }, []);

  const search = useCallback(
    (query: string): GraphGroup[] => {
      if (!query.trim()) return groups;
      const q = query.toLowerCase();
      return groups.filter((g) => g.displayName.toLowerCase().includes(q));
    },
    [groups]
  );

  return { groups, filters, isLoading, error, search };
}
