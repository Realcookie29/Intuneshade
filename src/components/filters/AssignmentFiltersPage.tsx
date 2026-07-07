import { useState, useEffect, useCallback } from "react";
import {
  Button, Text, Spinner, Badge,
  Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Menu, MenuTrigger, MenuList, MenuItem, MenuPopover,
  MessageBar, MessageBarBody,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  FilterRegular, AddRegular, EditRegular, DeleteRegular,
  MoreHorizontalRegular, ScanRegular, ArrowClockwiseRegular,
} from "@fluentui/react-icons";
import type { AssignmentFilter } from "../../types/graphTypes";
import type { PolicyType } from "../../types/policyTypes";
import { fetchFiltersDetailed, deleteFilter, scanFilterUsage } from "../../services/filtersService";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";
import FilterEditDialog from "./FilterEditDialog";
import PageHeader from "../layout/PageHeader";

const PLATFORM_LABELS: Record<string, string> = {
  windows10AndLater: "Windows 10+",
  iOS: "iOS/iPadOS",
  macOS: "macOS",
  android: "Android (DA)",
  androidWorkProfile: "Android (work profile)",
  androidAOSP: "Android (AOSP)",
  androidForWork: "Android Enterprise",
  windows81AndLater: "Windows 8.1+",
  unknown: "Unknown",
};

function platformLabel(p?: string): string {
  if (!p) return "—";
  return PLATFORM_LABELS[p] ?? p;
}

function typeLabel(t: PolicyType): string {
  return POLICY_DEFINITIONS.find((d) => d.type === t)?.label ?? t;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
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
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: tokens.fontSizeBase300, maxWidth: "560px" },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    flexWrap: "wrap",
  },
  content: { flex: 1, overflow: "auto" },
  table: { width: "100%", minWidth: "820px" },
  headerRow: { backgroundColor: tokens.colorNeutralBackground3 },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "10px 12px",
    whiteSpace: "nowrap",
  },
  cell: { padding: "10px 12px", verticalAlign: "middle" },
  rule: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    maxWidth: "320px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "block",
  },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100%", gap: "12px",
    color: tokens.colorNeutralForeground3, padding: "48px",
    textAlign: "center",
  },
  usageList: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" },
});

// Session cache — kept until the user hits Refresh or mutates a filter.
type UsageMap = Map<string, { policyId: string; policyName: string; policyType: PolicyType }[]>;
let filtersCache: AssignmentFilter[] | null = null;
let usageCache: UsageMap | null = null;

export default function AssignmentFiltersPage() {
  const styles = useStyles();
  const [filters, setFilters] = useState<AssignmentFilter[]>(filtersCache ?? []);
  const [loading, setLoading] = useState(!filtersCache);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AssignmentFilter | null | "new">(null);
  const [deleting, setDeleting] = useState<AssignmentFilter | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [usage, setUsage] = useState<UsageMap | null>(usageCache);
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState("");
  const [usageDetail, setUsageDetail] = useState<AssignmentFilter | null>(null);

  const load = useCallback(async (force = false) => {
    if (filtersCache && !force) {
      setFilters(filtersCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFiltersDetailed();
      data.sort((a, b) => a.displayName.localeCompare(b.displayName));
      filtersCache = data;
      setFilters(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const result = await scanFilterUsage((done, total, label) => {
        setScanPhase(label ? `Scanning ${label}… (${done}/${total})` : "");
      });
      usageCache = result;
      setUsage(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
      setScanPhase("");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteFilter(deleting.id);
      setDeleting(null);
      await load(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const usageCount = (id: string) => usage?.get(id)?.length ?? 0;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Targeting"
        title="Assignment Filters"
        subtitle="Create, edit and manage the assignment filters that scope your policy targeting — and see exactly which policies use each one."
        icon={<FilterRegular />}
      />

      <div className={styles.toolbar}>
        <Button appearance="primary" icon={<AddRegular />} onClick={() => setEditing("new")}>
          New Filter
        </Button>
        <Button
          appearance="secondary"
          icon={scanning ? <Spinner size="extra-tiny" /> : <ScanRegular />}
          onClick={runScan}
          disabled={scanning || loading}
        >
          {scanning ? scanPhase || "Scanning…" : usage ? "Rescan usage" : "Scan usage"}
        </Button>
        <Button appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={() => load(true)} disabled={loading}>
          Refresh
        </Button>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginLeft: "auto" }}>
          {filters.length} filter{filters.length === 1 ? "" : "s"}
        </Text>
      </div>

      <div className={styles.content}>
        {error && (
          <div style={{ padding: "12px 24px" }}>
            <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
          </div>
        )}

        {loading ? (
          <div className={styles.empty}><Spinner size="large" /><Text>Loading filters…</Text></div>
        ) : filters.length === 0 ? (
          <div className={styles.empty}>
            <FilterRegular style={{ fontSize: 48 }} />
            <Text size={500} weight="semibold">No assignment filters yet</Text>
            <Text size={300}>Create your first filter to scope policy targeting by device or app attributes.</Text>
            <Button appearance="primary" icon={<AddRegular />} onClick={() => setEditing("new")}>
              New Filter
            </Button>
          </div>
        ) : (
          <Table className={styles.table}>
            <TableHeader>
              <TableRow className={styles.headerRow}>
                <TableHeaderCell className={styles.headerCell}>Name</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Platform</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Type</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Rule</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Used by</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell} style={{ width: 48 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filters.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className={styles.cell}>
                    <Text weight="semibold" size={300}>{f.displayName}</Text>
                    {f.description && (
                      <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
                        {f.description}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <Text size={200}>{platformLabel(f.platform)}</Text>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <Badge appearance="tint" color={f.assignmentFilterManagementType === "apps" ? "warning" : "informative"}>
                      {f.assignmentFilterManagementType === "apps" ? "Apps" : "Devices"}
                    </Badge>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <span className={styles.rule} title={f.rule}>{f.rule || "—"}</span>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    {!usage ? (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>—</Text>
                    ) : usageCount(f.id) === 0 ? (
                      <Badge appearance="tint" color="subtle">Unused</Badge>
                    ) : (
                      <Button
                        size="small"
                        appearance="transparent"
                        onClick={() => setUsageDetail(f)}
                        style={{ minWidth: 0, padding: "0 4px" }}
                      >
                        {usageCount(f.id)} {usageCount(f.id) === 1 ? "policy" : "policies"}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <Button appearance="subtle" icon={<MoreHorizontalRegular />} size="small" />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem icon={<EditRegular />} onClick={() => setEditing(f)}>Edit</MenuItem>
                          <MenuItem icon={<DeleteRegular />} onClick={() => setDeleting(f)}>Delete</MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / edit */}
      {editing !== null && (
        <FilterEditDialog
          filter={editing === "new" ? null : editing}
          onSaved={() => { setEditing(null); load(true); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <Dialog open modalType="alert" onOpenChange={(_, d) => { if (!d.open && !deleteBusy) setDeleting(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Delete filter</DialogTitle>
              <DialogContent>
                Delete <strong>{deleting.displayName}</strong>? Policies currently using this filter
                will lose the scope. This can't be undone.
                {usage && usageCount(deleting.id) > 0 && (
                  <MessageBar intent="warning" style={{ marginTop: 12 }}>
                    <MessageBarBody>
                      This filter is used by {usageCount(deleting.id)} policy(ies).
                    </MessageBarBody>
                  </MessageBar>
                )}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</Button>
                <Button
                  appearance="primary"
                  onClick={confirmDelete}
                  disabled={deleteBusy}
                  icon={deleteBusy ? <Spinner size="tiny" /> : <DeleteRegular />}
                >
                  Delete
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}

      {/* Usage detail */}
      {usageDetail && (
        <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) setUsageDetail(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Policies using "{usageDetail.displayName}"</DialogTitle>
              <DialogContent>
                <div className={styles.usageList}>
                  {(usage?.get(usageDetail.id) ?? []).map((p) => (
                    <div key={p.policyId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge appearance="tint" size="small">{typeLabel(p.policyType)}</Badge>
                      <Text size={300}>{p.policyName}</Text>
                    </div>
                  ))}
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={() => setUsageDetail(null)}>Close</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}
