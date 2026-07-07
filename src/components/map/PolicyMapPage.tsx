import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  Handle, Position, useReactFlow, ReactFlowProvider,
} from "@xyflow/react";
import type { Node, Edge, NodeTypes, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Button, Text, Spinner, Checkbox, Input, makeStyles, tokens,
} from "@fluentui/react-components";
import { ScanRegular, ArrowFitRegular, SearchRegular, DismissRegular } from "@fluentui/react-icons";
import type { PolicyType, PolicyRow } from "../../types/policyTypes";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";
import { fetchPolicies } from "../../services/policiesService";
import { buildPolicyRows } from "../../utils/assignmentHelpers";
import { getGroupMap, getFilterMap } from "../../hooks/useGroups";

// ─── Colour palette ───────────────────────────────────────────────────────────

export const TYPE_COLORS: Record<PolicyType, string> = {
  mobileApps:                         "#0078d4",
  configurationPolicies:              "#00bcf2",
  deviceConfigurations:               "#00b7c3",
  deviceCompliancePolicies:           "#107c10",
  groupPolicyConfigurations:          "#ca5010",
  deviceManagementScripts:            "#8764b8",
  deviceHealthScripts:                "#e3008c",
  windowsAutopilotDeploymentProfiles: "#038387",
  mobileAppConfigurations:            "#004e8c",
  deviceManagementIntents:            "#73aa24",
};

// ─── Custom node data types ───────────────────────────────────────────────────

interface PolicyNodeData extends Record<string, unknown> {
  label: string;
  typeLabel: string;
  color: string;
  dimmed: boolean;
  highlight: boolean;
}

interface GroupNodeData extends Record<string, unknown> {
  label: string;
  virtual: boolean;
  dimmed: boolean;
  highlight: boolean;
}

// ─── Custom node components (defined outside to avoid re-registration) ────────

function PolicyNode({ data, selected }: NodeProps & { data: PolicyNodeData }) {
  return (
    <div style={{
      background: data.dimmed ? "#e0e0e0" : data.color,
      borderRadius: 8,
      padding: "7px 12px",
      minWidth: 190,
      maxWidth: 220,
      boxShadow: data.highlight
        ? "0 0 0 3px #ffb900, 0 4px 12px rgba(0,0,0,0.35)"
        : selected ? `0 0 0 2px white, 0 0 0 4px ${data.color}` : "0 2px 6px rgba(0,0,0,0.18)",
      opacity: data.dimmed ? 0.25 : 1,
      transition: "opacity 0.15s, box-shadow 0.15s",
    }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {data.typeLabel}
      </div>
      <div style={{ fontSize: 12, color: "white", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: "rgba(255,255,255,0.7)", border: "none", width: 8, height: 8 }} />
    </div>
  );
}

function GroupNode({ data, selected }: NodeProps & { data: GroupNodeData }) {
  return (
    <div style={{
      background: data.highlight ? "#fff8e6" : data.virtual ? "#f0f7ff" : (data.dimmed ? "#f5f5f5" : "white"),
      border: `2px solid ${data.highlight ? "#ffb900" : selected ? "#0078d4" : data.virtual ? "#0078d4" : "#d0d0d0"}`,
      borderRadius: 8,
      padding: "7px 12px",
      minWidth: 170,
      maxWidth: 210,
      boxShadow: data.highlight ? "0 0 0 3px #ffb90055, 0 4px 12px rgba(0,0,0,0.2)" : selected ? "0 0 0 2px #0078d430" : "0 1px 4px rgba(0,0,0,0.1)",
      opacity: data.dimmed ? 0.25 : 1,
      transition: "opacity 0.15s, box-shadow 0.15s",
    }}>
      <Handle type="target" position={Position.Left} style={{ background: "#0078d4", border: "none", width: 8, height: 8 }} />
      {data.virtual && (
        <div style={{ fontSize: 9, color: "#0078d4", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Virtual
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {data.label}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  policyNode: PolicyNode as unknown as NodeTypes[string],
  groupNode: GroupNode as unknown as NodeTypes[string],
};

// ─── Internal map view (needs ReactFlowProvider) ──────────────────────────────

export interface MapRow {
  policyId: string;
  policyName: string;
  policyType: PolicyType;
  groupKey: string;
  groupLabel: string;
  isVirtual: boolean;
}

interface MapViewProps {
  rows: MapRow[];
  activeTypes: Set<PolicyType>;
  searchQuery: string;
}

export function PolicyMapView({ rows, activeTypes, searchQuery }: MapViewProps) {
  const { fitView } = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { nodes, edges, matchedIds } = useMemo(() => {
    const filtered = rows.filter(r => activeTypes.has(r.policyType));
    const q = searchQuery.trim().toLowerCase();

    // Collect unique policies and groups
    const policies = new Map<string, { name: string; type: PolicyType }>();
    const groups = new Map<string, { label: string; virtual: boolean }>();
    const edgeSet = new Set<string>();
    const edgeList: { id: string; source: string; target: string; type: PolicyType }[] = [];

    for (const r of filtered) {
      policies.set(r.policyId, { name: r.policyName, type: r.policyType });
      groups.set(r.groupKey, { label: r.groupLabel, virtual: r.isVirtual });
      const eid = `${r.policyId}--${r.groupKey}`;
      if (!edgeSet.has(eid)) {
        edgeSet.add(eid);
        edgeList.push({ id: eid, source: `p-${r.policyId}`, target: `g-${r.groupKey}`, type: r.policyType });
      }
    }

    // ── Search: find direct label matches, then keep their neighbours bright ──
    // Searching a group reveals every policy assigned to it (reverse lookup),
    // and searching a policy reveals every group it targets.
    const directMatch = new Set<string>();
    const highlightSet = new Set<string>();
    if (q) {
      for (const [id, { name }] of policies) {
        if (name.toLowerCase().includes(q)) directMatch.add(`p-${id}`);
      }
      for (const [key, { label }] of groups) {
        if (label.toLowerCase().includes(q)) directMatch.add(`g-${key}`);
      }
      for (const id of directMatch) highlightSet.add(id);
      for (const e of edgeList) {
        if (directMatch.has(e.source)) highlightSet.add(e.target);
        if (directMatch.has(e.target)) highlightSet.add(e.source);
      }
    }

    // Layout — policies left, groups right
    // Group policies by type for visual clustering
    const byType = new Map<PolicyType, string[]>();
    for (const [id, { type }] of policies) {
      const arr = byType.get(type) ?? [];
      arr.push(id);
      byType.set(type, arr);
    }

    const pNodes: Node[] = [];
    let yP = 0;
    const typeOrder = POLICY_DEFINITIONS.map(d => d.type);
    for (const type of typeOrder) {
      const ids = byType.get(type);
      if (!ids) continue;
      ids.sort((a, b) => (policies.get(a)?.name ?? "").localeCompare(policies.get(b)?.name ?? ""));
      for (const id of ids) {
        const pid = `p-${id}`;
        const pLabel = policies.get(id)!.name;
        const pDimmedBySearch = q ? !highlightSet.has(pid) : false;
        const pDimmedByClick = !q && selectedId !== null && selectedId !== pid &&
          !edgeList.some(e => e.source === pid && e.target === selectedId);
        pNodes.push({
          id: pid,
          type: "policyNode",
          position: { x: 0, y: yP },
          data: {
            label: pLabel,
            typeLabel: POLICY_DEFINITIONS.find(d => d.type === type)?.label ?? type,
            color: TYPE_COLORS[type],
            dimmed: pDimmedBySearch || pDimmedByClick,
            highlight: directMatch.has(pid),
          } satisfies PolicyNodeData,
          draggable: true,
        });
        yP += 70;
      }
      yP += 20; // gap between type groups
    }

    const gList = [...groups.entries()].sort(([, a], [, b]) => {
      if (a.virtual !== b.virtual) return a.virtual ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    const gNodes: Node[] = gList.map(([key, { label, virtual }], i) => {
      const gid = `g-${key}`;
      const gDimmedBySearch = q ? !highlightSet.has(gid) : false;
      const gDimmedByClick = !q && selectedId !== null && selectedId !== gid &&
        !edgeList.some(e => e.target === gid && e.source === selectedId);
      return {
        id: gid,
        type: "groupNode",
        position: { x: 580, y: i * 65 },
        data: {
          label,
          virtual,
          dimmed: gDimmedBySearch || gDimmedByClick,
          highlight: directMatch.has(gid),
        } satisfies GroupNodeData,
        draggable: true,
      };
    });

    const rfEdges: Edge[] = edgeList.map(e => {
      let dimmed: boolean;
      let connected = false;
      if (q) {
        // Bright only if this edge connects a direct match to one of its neighbours
        connected = (directMatch.has(e.source) || directMatch.has(e.target)) &&
          highlightSet.has(e.source) && highlightSet.has(e.target);
        dimmed = !connected;
      } else {
        connected = selectedId === e.source || selectedId === e.target;
        dimmed = selectedId !== null && !connected;
      }
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        style: {
          stroke: dimmed ? "#d0d0d0" : TYPE_COLORS[e.type],
          strokeWidth: connected ? 2.5 : 1.5,
          opacity: dimmed ? 0.15 : connected ? 1 : 0.6,
          transition: "opacity 0.15s, stroke-width 0.15s",
        },
        animated: connected,
      };
    });

    return { nodes: [...pNodes, ...gNodes], edges: rfEdges, matchedIds: [...directMatch] };
  }, [rows, activeTypes, selectedId, searchQuery]);

  // Auto-zoom the viewport to the matched nodes so admins never have to hunt
  // for a highlighted group by hand in a large map.
  const matchedKey = matchedIds.join("|");
  useEffect(() => {
    if (!searchQuery.trim() || matchedIds.length === 0) return;
    const t = setTimeout(() => {
      fitView({
        nodes: matchedIds.map((id) => ({ id })),
        duration: 500,
        padding: 0.35,
        maxZoom: 1.4,
      });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedKey]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(prev => prev === node.id ? null : node.id);
  }, []);

  const onPaneClick = useCallback(() => setSelectedId(null), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#e8e8e8" gap={20} />
      <Controls />
      <MiniMap
        nodeColor={(n) => {
          if (n.type === "policyNode") return (n.data as PolicyNodeData).color as string;
          return "#0078d4";
        }}
        maskColor="rgba(255,255,255,0.7)"
      />
      <div style={{ position: "absolute", top: 10, right: 60, zIndex: 10 }}>
        <Button
          size="small"
          appearance="subtle"
          icon={<ArrowFitRegular />}
          onClick={() => fitView({ duration: 400 })}
        >
          Fit view
        </Button>
      </div>
    </ReactFlow>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%" },
  hero: {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)",
    padding: "24px 32px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    flexWrap: "wrap",
  },
  heroLeft: { display: "flex", flexDirection: "column", gap: "4px" },
  heroTitle: { color: "white", fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: tokens.fontSizeBase300 },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    padding: "12px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  statsRow: {
    display: "flex",
    gap: "24px",
    padding: "10px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  stat: { display: "flex", flexDirection: "column", gap: "1px" },
  statVal: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  statLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  canvas: { flex: 1, minHeight: 0 },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100%",
    color: tokens.colorNeutralForeground3, gap: "12px",
  },
  filterDot: {
    width: "10px", height: "10px", borderRadius: "50%", display: "inline-block",
    marginRight: "6px", flexShrink: 0,
  },
  progressWrap: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100%", gap: "16px",
  },
});

// ─── Main export ──────────────────────────────────────────────────────────────

type ScanStatus = "idle" | "scanning" | "done";

export default function PolicyMapPage() {
  const styles = useStyles();
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [mapRows, setMapRows] = useState<MapRow[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<PolicyType>>(
    new Set(POLICY_DEFINITIONS.map(d => d.type))
  );
  const [searchQuery, setSearchQuery] = useState("");

  const scan = async () => {
    setStatus("scanning");
    setProgress(0);
    setMapRows([]);
    const gMap = getGroupMap();
    const fMap = getFilterMap();
    const all: MapRow[] = [];

    for (let i = 0; i < POLICY_DEFINITIONS.length; i++) {
      const def = POLICY_DEFINITIONS[i];
      setPhase(`Loading ${def.label}…`);
      try {
        const policies = await fetchPolicies(def.type);
        for (const policy of policies) {
          const rows: PolicyRow[] = buildPolicyRows(policy, gMap, fMap);
          for (const r of rows) {
            if (r.assignmentType === "No Assignment") continue;
            const isVirtual = r.assignmentType === "All Users" || r.assignmentType === "All Devices";
            const groupKey = isVirtual ? r.assignmentType : (r.groupId ?? "unknown");
            const groupLabel = isVirtual ? r.assignmentType : r.groupDisplayName;
            all.push({
              policyId: r.policyId,
              policyName: r.policyName,
              policyType: def.type,
              groupKey,
              groupLabel,
              isVirtual,
            });
          }
        }
      } catch { /* skip failing types */ }
      setProgress(Math.round(((i + 1) / POLICY_DEFINITIONS.length) * 100));
    }

    setMapRows(all);
    setStatus("done");
    setPhase("");
  };

  const toggleType = (type: PolicyType) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  // Stats for visible data
  const stats = useMemo(() => {
    const filtered = mapRows.filter(r => activeTypes.has(r.policyType));
    const policies = new Set(filtered.map(r => r.policyId)).size;
    const groups = new Set(filtered.map(r => r.groupKey)).size;
    const connections = new Set(filtered.map(r => `${r.policyId}--${r.groupKey}`)).size;
    return { policies, groups, connections };
  }, [mapRows, activeTypes]);

  // How many policies/groups directly match the search (drives the counter hint)
  const searchMatchCount = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const filtered = mapRows.filter(r => activeTypes.has(r.policyType));
    const matched = new Set<string>();
    for (const r of filtered) {
      if (r.policyName.toLowerCase().includes(q)) matched.add(`p-${r.policyId}`);
      if (r.groupLabel.toLowerCase().includes(q)) matched.add(`g-${r.groupKey}`);
    }
    return matched.size;
  }, [searchQuery, mapRows, activeTypes]);

  return (
    <div className={styles.root}>
      {/* Hero header */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <Text className={styles.heroTitle}>Policy Map</Text>
          <Text className={styles.heroSub}>
            Interactive visualisation of policy → group assignments across your tenant
          </Text>
        </div>
        <Button
          appearance="primary"
          icon={status === "scanning" ? <Spinner size="extra-tiny" /> : <ScanRegular />}
          disabled={status === "scanning"}
          onClick={scan}
          size="large"
        >
          {status === "scanning" ? phase || "Loading…" : status === "done" ? "Reload Map" : "Load Map"}
        </Button>
      </div>

      {/* Filter bar */}
      {status === "done" && (
        <>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <Text className={styles.statVal}>{stats.policies}</Text>
              <Text className={styles.statLabel}>Policies</Text>
            </div>
            <div className={styles.stat}>
              <Text className={styles.statVal}>{stats.groups}</Text>
              <Text className={styles.statLabel}>Groups</Text>
            </div>
            <div className={styles.stat}>
              <Text className={styles.statVal}>{stats.connections}</Text>
              <Text className={styles.statLabel}>Connections</Text>
            </div>
          </div>
          <div className={styles.controls}>
            <Input
              placeholder="Search policies or groups…"
              value={searchQuery}
              onChange={(_, d) => setSearchQuery(d.value)}
              contentBefore={<SearchRegular />}
              contentAfter={
                searchQuery ? (
                  <Button
                    size="small"
                    appearance="transparent"
                    icon={<DismissRegular />}
                    onClick={() => setSearchQuery("")}
                    style={{ minWidth: 0, padding: "0 2px" }}
                  />
                ) : undefined
              }
              style={{ minWidth: 220 }}
            />
            {searchMatchCount !== null && (
              <Text
                size={200}
                weight="semibold"
                style={{
                  color: searchMatchCount === 0 ? tokens.colorPaletteRedForeground1 : tokens.colorNeutralForeground3,
                  whiteSpace: "nowrap",
                }}
              >
                {searchMatchCount === 0
                  ? "No matches"
                  : `${searchMatchCount} match${searchMatchCount === 1 ? "" : "es"}`}
              </Text>
            )}
            <div style={{ width: 1, height: 20, background: tokens.colorNeutralStroke2, margin: "0 4px" }} />
            <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>FILTER:</Text>
            {POLICY_DEFINITIONS.map(def => (
              <Checkbox
                key={def.type}
                checked={activeTypes.has(def.type)}
                onChange={() => toggleType(def.type)}
                label={
                  <span style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                    <span className={styles.filterDot} style={{ backgroundColor: TYPE_COLORS[def.type] }} />
                    {def.label}
                  </span>
                }
              />
            ))}
          </div>
        </>
      )}

      {/* Canvas */}
      <div className={styles.canvas}>
        {status === "idle" && (
          <div className={styles.empty}>
            <Text size={500} weight="semibold">Policy Map</Text>
            <Text size={300}>Click "Load Map" to visualise all policy assignments across your tenant.</Text>
            <Button appearance="primary" icon={<ScanRegular />} onClick={scan}>Load Map</Button>
          </div>
        )}

        {status === "scanning" && (
          <div className={styles.progressWrap}>
            <Spinner size="large" />
            <Text size={400} weight="semibold">{phase}</Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>{progress}% complete</Text>
          </div>
        )}

        {status === "done" && (
          <ReactFlowProvider>
            <PolicyMapView rows={mapRows} activeTypes={activeTypes} searchQuery={searchQuery} />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
