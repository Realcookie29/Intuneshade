import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Button, Text, Spinner, Badge, Input,
  Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  MessageBar, MessageBarBody,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  History24Regular, SearchRegular, DismissRegular, ArrowClockwiseRegular,
} from "@fluentui/react-icons";
import type { AuditEvent } from "../../types/graphTypes";
import { fetchAuditEvents } from "../../services/auditService";
import PageHeader from "../layout/PageHeader";

type OpFilter = "all" | "Create" | "Patch" | "Delete";

function opColor(op?: string): "success" | "warning" | "danger" | "informative" {
  switch (op) {
    case "Create": return "success";
    case "Delete": return "danger";
    case "Patch":
    case "Update": return "warning";
    default: return "informative";
  }
}

function actorName(e: AuditEvent): string {
  const a = e.actor;
  return a?.userPrincipalName || a?.applicationDisplayName || a?.servicePrincipalName || "System";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
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
  toolbar: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "12px 24px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2, flexWrap: "wrap",
  },
  content: { flex: 1, overflow: "auto" },
  table: { width: "100%", minWidth: "860px" },
  headerRow: { backgroundColor: tokens.colorNeutralBackground3 },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2, textTransform: "uppercase",
    letterSpacing: "0.04em", padding: "10px 12px", whiteSpace: "nowrap",
  },
  cell: { padding: "9px 12px", verticalAlign: "middle" },
  clickRow: { cursor: "pointer", ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover } },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100%", gap: "12px",
    color: tokens.colorNeutralForeground3, padding: "48px", textAlign: "center",
  },
  propTable: { width: "100%", marginTop: "8px" },
  propHead: {
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3, textAlign: "left", padding: "4px 8px",
  },
  propCell: { padding: "4px 8px", fontSize: tokens.fontSizeBase200, verticalAlign: "top", wordBreak: "break-word" },
});

// Session cache — kept until the user hits Refresh.
let auditCache: AuditEvent[] | null = null;

export default function AuditHistoryPage() {
  const styles = useStyles();
  const [events, setEvents] = useState<AuditEvent[]>(auditCache ?? []);
  const [loading, setLoading] = useState(!auditCache);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [opFilter, setOpFilter] = useState<OpFilter>("all");
  const [detail, setDetail] = useState<AuditEvent | null>(null);

  const load = useCallback(async (force = false) => {
    if (auditCache && !force) {
      setEvents(auditCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditEvents(500);
      auditCache = data;
      setEvents(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (opFilter !== "all") {
        const op = e.activityOperationType;
        if (opFilter === "Patch" ? op !== "Patch" && op !== "Update" : op !== opFilter) return false;
      }
      if (!q) return true;
      const hay = [
        e.displayName, e.activityType, e.category, actorName(e),
        e.resources?.[0]?.displayName,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [events, search, opFilter]);

  const opFilters: OpFilter[] = ["all", "Create", "Patch", "Delete"];

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Activity"
        title="Audit History"
        subtitle="Who changed what, and when — recent create, update and delete activity across your Intune policies, apps and assignments."
        icon={<History24Regular />}
      />

      <div className={styles.toolbar}>
        <Input
          placeholder="Search actor, policy, activity…"
          value={search}
          onChange={(_, d) => setSearch(d.value)}
          contentBefore={<SearchRegular />}
          contentAfter={
            search ? (
              <Button size="small" appearance="transparent" icon={<DismissRegular />}
                onClick={() => setSearch("")} style={{ minWidth: 0, padding: "0 2px" }} />
            ) : undefined
          }
          style={{ minWidth: 260 }}
        />
        <div style={{ width: 1, height: 20, background: tokens.colorNeutralStroke2, margin: "0 4px" }} />
        {opFilters.map((op) => (
          <Button
            key={op}
            size="small"
            appearance={opFilter === op ? "primary" : "subtle"}
            onClick={() => setOpFilter(op)}
          >
            {op === "all" ? "All" : op === "Patch" ? "Update" : op}
          </Button>
        ))}
        <Button appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={() => load(true)}
          disabled={loading} style={{ marginLeft: "auto" }}>
          Refresh
        </Button>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {filtered.length} event{filtered.length === 1 ? "" : "s"}
        </Text>
      </div>

      <div className={styles.content}>
        {error && (
          <div style={{ padding: "12px 24px" }}>
            <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
          </div>
        )}

        {loading ? (
          <div className={styles.empty}><Spinner size="large" /><Text>Loading audit events…</Text></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <History24Regular style={{ fontSize: 48 }} />
            <Text size={500} weight="semibold">No audit events</Text>
            <Text size={300}>
              {events.length === 0
                ? "No recent Intune audit activity was returned for this tenant."
                : "No events match your filters."}
            </Text>
          </div>
        ) : (
          <Table className={styles.table}>
            <TableHeader>
              <TableRow className={styles.headerRow}>
                <TableHeaderCell className={styles.headerCell}>When</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Actor</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Operation</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Activity</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Target</TableHeaderCell>
                <TableHeaderCell className={styles.headerCell}>Result</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id} className={styles.clickRow} onClick={() => setDetail(e)}>
                  <TableCell className={styles.cell}>
                    <Text size={200} style={{ whiteSpace: "nowrap" }}>{formatDate(e.activityDateTime)}</Text>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <Text size={200}>{actorName(e)}</Text>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <Badge appearance="tint" color={opColor(e.activityOperationType)}>
                      {e.activityOperationType === "Patch" ? "Update" : e.activityOperationType || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <Text size={200}>{e.activityType || e.displayName || "—"}</Text>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <Text size={200}>{e.resources?.[0]?.displayName || "—"}</Text>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <Badge appearance="ghost" color={e.activityResult === "Success" ? "success" : "danger"}>
                      {e.activityResult || "—"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail dialog */}
      {detail && (
        <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) setDetail(null); }}>
          <DialogSurface style={{ maxWidth: 680 }}>
            <DialogBody>
              <DialogTitle>{detail.activityType || detail.displayName || "Audit event"}</DialogTitle>
              <DialogContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Text size={200}><strong>When:</strong> {formatDate(detail.activityDateTime)}</Text>
                  <Text size={200}><strong>Actor:</strong> {actorName(detail)}
                    {detail.actor?.ipAddress ? ` (${detail.actor.ipAddress})` : ""}</Text>
                  <Text size={200}><strong>Operation:</strong> {detail.activityOperationType || "—"} · {detail.activityResult || "—"}</Text>
                  <Text size={200}><strong>Category:</strong> {detail.category || "—"}</Text>
                  <Text size={200}><strong>Target:</strong> {detail.resources?.[0]?.displayName || "—"}</Text>
                </div>

                {(detail.resources ?? []).some((r) => (r.modifiedProperties ?? []).length > 0) && (
                  <>
                    <Text size={300} weight="semibold" style={{ display: "block", marginTop: 14 }}>
                      Changed properties
                    </Text>
                    <table className={styles.propTable}>
                      <thead>
                        <tr>
                          <th className={styles.propHead}>Property</th>
                          <th className={styles.propHead}>Old</th>
                          <th className={styles.propHead}>New</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.resources!.flatMap((r) =>
                          (r.modifiedProperties ?? []).map((mp, i) => (
                            <tr key={`${r.resourceId}-${i}`}>
                              <td className={styles.propCell}>{mp.displayName || "—"}</td>
                              <td className={styles.propCell} style={{ color: tokens.colorPaletteRedForeground1 }}>
                                {mp.oldValue ?? "—"}
                              </td>
                              <td className={styles.propCell} style={{ color: tokens.colorPaletteGreenForeground1 }}>
                                {mp.newValue ?? "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </>
                )}
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
