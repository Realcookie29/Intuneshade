import { useState, useMemo, useEffect } from "react";
import {
  Button, Text, Spinner, Input, Badge,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  ScanRegular, SearchRegular, DismissRegular, GridRegular, ShareRegular,
} from "@fluentui/react-icons";
import { ReactFlowProvider } from "@xyflow/react";
import type { PolicyType, PolicyRow } from "../../types/policyTypes";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";
import { getAssignments, isAssignmentsCached } from "../../services/assignmentScanService";
import { PolicyMapView, TYPE_COLORS, type MapRow } from "./PolicyMapPage";
import PageHeader from "../layout/PageHeader";

const SHORT_LABELS: Record<PolicyType, string> = {
  mobileApps: "Apps",
  configurationPolicies: "Settings Catalog",
  deviceConfigurations: "Device Config",
  deviceCompliancePolicies: "Compliance",
  groupPolicyConfigurations: "ADMX",
  deviceManagementScripts: "Platform Scripts",
  deviceHealthScripts: "Remediations",
  windowsAutopilotDeploymentProfiles: "Autopilot",
  mobileAppConfigurations: "App Config",
  deviceManagementIntents: "Baselines",
};

interface MatrixRow extends MapRow {
  assignmentType: PolicyRow["assignmentType"];
  filterDisplayName: string;
  installIntent: string;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  hero: {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)",
    padding: "24px 32px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "24px", flexWrap: "wrap",
  },
  heroLeft: { display: "flex", flexDirection: "column", gap: "4px" },
  heroTitle: { color: "white", fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: tokens.fontSizeBase300, maxWidth: "560px" },
  controls: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
    padding: "12px 24px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  stat: { display: "flex", flexDirection: "column", gap: "1px", marginRight: "8px" },
  statVal: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, lineHeight: "1" },
  statLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  toggle: { display: "flex", border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: "6px", overflow: "hidden" },
  scroll: { flex: 1, overflow: "auto", position: "relative" },
  table: { borderCollapse: "separate", borderSpacing: 0, width: "max-content", minWidth: "100%" },
  corner: {
    position: "sticky", left: 0, top: 0, zIndex: 3,
    background: tokens.colorNeutralBackground3, textAlign: "left",
    padding: "8px 12px", minWidth: "220px", maxWidth: "320px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3, textTransform: "uppercase", letterSpacing: "0.04em",
  },
  colHead: {
    position: "sticky", top: 0, zIndex: 2, background: tokens.colorNeutralBackground3,
    padding: "8px 6px", minWidth: "92px", maxWidth: "110px", verticalAlign: "bottom",
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textAlign: "center",
  },
  colDot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block", marginRight: "4px" },
  rowHead: {
    position: "sticky", left: 0, zIndex: 1, background: tokens.colorNeutralBackground1,
    padding: "6px 12px", minWidth: "220px", maxWidth: "320px",
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  cell: {
    padding: "4px", textAlign: "center", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
  },
  cellBtn: {
    minWidth: "34px", cursor: "pointer", border: "none", background: "transparent",
    borderRadius: "4px", padding: "3px 6px", fontWeight: tokens.fontWeightSemibold,
    ":hover": { background: tokens.colorNeutralBackground3 },
  },
  totalHead: {
    position: "sticky", top: 0, zIndex: 2, background: tokens.colorNeutralBackground3,
    padding: "8px 10px", borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textAlign: "center",
  },
  totalCell: {
    padding: "4px 10px", textAlign: "center", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`, fontWeight: tokens.fontWeightSemibold,
  },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: "100%", gap: "12px", color: tokens.colorNeutralForeground3, padding: "48px", textAlign: "center",
  },
  progressWrap: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: "100%", gap: "16px",
  },
  graphWrap: { flex: 1, minHeight: 0 },
});

type ScanStatus = "idle" | "scanning" | "done";
type ViewMode = "matrix" | "graph";

export default function AssignmentMatrixPage() {
  const styles = useStyles();
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("matrix");
  const [detail, setDetail] = useState<{ groupLabel: string; type: PolicyType; items: MatrixRow[] } | null>(null);

  const scan = async (force = false) => {
    // Reuse the shared tenant scan (warmed at login) — instant unless forced.
    const warm = isAssignmentsCached() && !force;
    if (!warm) {
      setStatus("scanning");
      setProgress(0);
    }
    try {
      const recs = await getAssignments((done, total, label) => {
        setPhase(`Loading ${label}…`);
        setProgress(Math.round((done / total) * 100));
      }, force);

      const all: MatrixRow[] = recs.map((r) => {
        const isVirtual = r.targetKind !== "group";
        const virtLabel = r.targetKind === "allUsers" ? "All Users" : "All Devices";
        return {
          policyId: r.policyId, policyName: r.policyName, policyType: r.policyType,
          groupKey: isVirtual ? virtLabel : (r.groupId ?? "unknown"),
          groupLabel: isVirtual ? virtLabel : r.groupName,
          isVirtual,
          assignmentType: r.mode === "exclude" ? "Exclude" : isVirtual ? virtLabel : "Include",
          filterDisplayName: r.filterName,
          installIntent: r.installIntent,
        };
      });

      setRows(all);
      setStatus("done");
      setPhase("");
    } catch {
      setStatus("idle");
    }
  };

  // Auto-load from the shared cache on mount — instant when warmed at login.
  // Deferred to a microtask so the initial state update happens outside the
  // synchronous effect body.
  useEffect(() => {
    queueMicrotask(() => void scan(false));
  }, []);

  // Aggregate rows into the matrix structure
  const { groupsList, typesPresent, cells, stats } = useMemo(() => {
    const groups = new Map<string, { label: string; isVirtual: boolean }>();
    const typeSet = new Set<PolicyType>();
    const cells = new Map<string, { include: MatrixRow[]; exclude: MatrixRow[] }>();

    for (const r of rows) {
      groups.set(r.groupKey, { label: r.groupLabel, isVirtual: r.isVirtual });
      typeSet.add(r.policyType);
      const key = `${r.groupKey}|${r.policyType}`;
      const c = cells.get(key) ?? { include: [], exclude: [] };
      if (r.assignmentType === "Exclude") c.exclude.push(r);
      else c.include.push(r);
      cells.set(key, c);
    }

    const typesPresent = POLICY_DEFINITIONS.filter((d) => typeSet.has(d.type));
    const groupsList = [...groups.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (a.isVirtual !== b.isVirtual ? (a.isVirtual ? -1 : 1) : a.label.localeCompare(b.label)));

    const distinctPolicies = new Set(rows.map((r) => r.policyId)).size;
    return {
      groupsList, typesPresent, cells,
      stats: { policies: distinctPolicies, groups: groups.size, assignments: rows.length },
    };
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groupsList;
    return groupsList.filter((g) => g.label.toLowerCase().includes(q));
  }, [groupsList, search]);

  const distinctCount = (items: MatrixRow[]) => new Set(items.map((i) => i.policyId)).size;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Visualise"
        title="Assignment Matrix"
        subtitle="Every group × policy-type at a glance. Search a group to filter instantly, click a cell to see exactly which policies are assigned."
        icon={<GridRegular />}
        actions={
          <Button
            appearance="primary" size="large"
            icon={status === "scanning" ? <Spinner size="extra-tiny" /> : <ScanRegular />}
            disabled={status === "scanning"}
            onClick={() => scan(true)}
          >
            {status === "scanning" ? phase || "Loading…" : status === "done" ? "Reload" : "Load Matrix"}
          </Button>
        }
      />

      {status === "done" && (
        <div className={styles.controls}>
          <div className={styles.stat}><Text className={styles.statVal}>{stats.groups}</Text><Text className={styles.statLabel}>Groups</Text></div>
          <div className={styles.stat}><Text className={styles.statVal}>{stats.policies}</Text><Text className={styles.statLabel}>Policies</Text></div>
          <div className={styles.stat}><Text className={styles.statVal}>{stats.assignments}</Text><Text className={styles.statLabel}>Assignments</Text></div>

          <Input
            placeholder="Search a group… (e.g. AIS)"
            value={search}
            onChange={(_, d) => setSearch(d.value)}
            contentBefore={<SearchRegular />}
            contentAfter={
              search ? (
                <Button size="small" appearance="transparent" icon={<DismissRegular />}
                  onClick={() => setSearch("")} style={{ minWidth: 0, padding: "0 2px" }} />
              ) : undefined
            }
            style={{ minWidth: 240, marginLeft: 8 }}
          />
          {search && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {filteredGroups.length} group{filteredGroups.length === 1 ? "" : "s"}
            </Text>
          )}

          <div className={styles.toggle} style={{ marginLeft: "auto" }}>
            <Button appearance={view === "matrix" ? "primary" : "subtle"} icon={<GridRegular />}
              size="small" shape="square" onClick={() => setView("matrix")}>Matrix</Button>
            <Button appearance={view === "graph" ? "primary" : "subtle"} icon={<ShareRegular />}
              size="small" shape="square" onClick={() => setView("graph")}>Graph</Button>
          </div>
        </div>
      )}

      {status === "idle" && (
        <div className={styles.empty}>
          <GridRegular style={{ fontSize: 48 }} />
          <Text size={500} weight="semibold">Assignment Matrix</Text>
          <Text size={300}>Click "Load Matrix" to build a group × policy-type overview of your tenant.</Text>
          <Button appearance="primary" icon={<ScanRegular />} onClick={() => scan(true)}>Load Matrix</Button>
        </div>
      )}

      {status === "scanning" && (
        <div className={styles.progressWrap}>
          <Spinner size="large" />
          <Text size={400} weight="semibold">{phase}</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>{progress}% complete</Text>
        </div>
      )}

      {status === "done" && view === "graph" && (
        <div className={styles.graphWrap}>
          <ReactFlowProvider>
            <PolicyMapView
              rows={rows}
              activeTypes={new Set(typesPresent.map((t) => t.type))}
              searchQuery={search}
            />
          </ReactFlowProvider>
        </div>
      )}

      {status === "done" && view === "matrix" && (
        <div className={styles.scroll}>
          {filteredGroups.length === 0 ? (
            <div className={styles.empty}>
              <Text size={400} weight="semibold">No groups match "{search}"</Text>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.corner}>Group</th>
                  {typesPresent.map((t) => (
                    <th key={t.type} className={styles.colHead}>
                      <span className={styles.colDot} style={{ backgroundColor: TYPE_COLORS[t.type] }} />
                      {SHORT_LABELS[t.type]}
                    </th>
                  ))}
                  <th className={styles.totalHead}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((g) => {
                  let rowTotal = 0;
                  const groupPolicyIds = new Set<string>();
                  return (
                    <tr key={g.key}>
                      <td className={styles.rowHead} title={g.label}>
                        {g.isVirtual && <Badge appearance="tint" color="informative" size="small" style={{ marginRight: 6 }}>virtual</Badge>}
                        {g.label}
                      </td>
                      {typesPresent.map((t) => {
                        const c = cells.get(`${g.key}|${t.type}`);
                        const inc = c ? distinctCount(c.include) : 0;
                        const exc = c ? distinctCount(c.exclude) : 0;
                        c?.include.forEach((i) => groupPolicyIds.add(i.policyId));
                        c?.exclude.forEach((i) => groupPolicyIds.add(i.policyId));
                        rowTotal = groupPolicyIds.size;
                        if (inc === 0 && exc === 0) {
                          return <td key={t.type} className={styles.cell} style={{ color: tokens.colorNeutralForeground4 }}>·</td>;
                        }
                        return (
                          <td key={t.type} className={styles.cell}>
                            <button
                              className={styles.cellBtn}
                              onClick={() => setDetail({
                                groupLabel: g.label, type: t.type,
                                items: [...(c?.include ?? []), ...(c?.exclude ?? [])],
                              })}
                              title="Show policies"
                            >
                              {inc > 0 && <span style={{ color: TYPE_COLORS[t.type] }}>●{inc}</span>}
                              {exc > 0 && <span style={{ color: tokens.colorPaletteRedForeground1, marginLeft: inc > 0 ? 4 : 0 }}>⊘{exc}</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td className={styles.totalCell}>{rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Cell detail */}
      {detail && (
        <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) setDetail(null); }}>
          <DialogSurface style={{ maxWidth: 560 }}>
            <DialogBody>
              <DialogTitle>
                {detail.groupLabel} · {SHORT_LABELS[detail.type]}
              </DialogTitle>
              <DialogContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {detail.items.map((it, i) => (
                    <div key={`${it.policyId}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge appearance="tint" size="small"
                        color={it.assignmentType === "Exclude" ? "danger" : "brand"}>
                        {it.assignmentType}
                      </Badge>
                      <Text size={300} style={{ flex: 1 }}>{it.policyName}</Text>
                      {it.installIntent && <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{it.installIntent}</Text>}
                      {it.filterDisplayName && <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>⧉ {it.filterDisplayName}</Text>}
                    </div>
                  ))}
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={() => setDetail(null)}>Close</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}
