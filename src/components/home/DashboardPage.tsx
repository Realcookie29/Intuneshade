import { useEffect, useMemo } from "react";
import {
  Button, Text, Spinner, Badge, ProgressBar, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  ScanRegular, WarningFilled, PulseRegular, PeopleTeamRegular, ArrowSwapRegular,
  GridRegular, ArrowSyncCircleRegular, AlertRegular, HistoryRegular, ChevronRightRegular,
  DocumentTableRegular,
} from "@fluentui/react-icons";
import PageHeader from "../layout/PageHeader";
import { ACCENTS, FONTS } from "../../theme/theme";
import type { ToolView } from "../layout/NavSidebar";
import { useGroups } from "../../hooks/useGroups";
import { useDashboardStore } from "../../store/dashboardStore";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  scroll: { flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: "20px" },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" },
  tile: {
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: "12px",
    padding: "16px 18px", backgroundColor: tokens.colorNeutralBackground2,
    display: "flex", flexDirection: "column", gap: "6px", position: "relative", overflow: "hidden",
  },
  tileLabel: {
    fontFamily: FONTS.mono, fontSize: "10.5px", letterSpacing: "0.12em",
    textTransform: "uppercase", color: tokens.colorNeutralForeground3,
  },
  tileVal: { fontFamily: FONTS.display, fontSize: "34px", fontWeight: 600, lineHeight: "1" },
  tileSub: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground2, padding: "16px 18px",
    display: "flex", flexDirection: "column", gap: "12px",
  },
  cardHead: { display: "flex", alignItems: "center", gap: "8px" },
  cardTitle: { fontFamily: FONTS.display, fontSize: "15px", fontWeight: 600 },
  healthRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 0", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  healthLeft: { display: "flex", alignItems: "center", gap: "8px" },
  bar: { display: "flex", flexDirection: "column", gap: "5px" },
  barRow: { display: "flex", alignItems: "center", gap: "8px" },
  barTrack: { flex: 1, height: "6px", borderRadius: "3px", backgroundColor: tokens.colorNeutralBackground4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: "3px" },
  barLabel: { fontSize: tokens.fontSizeBase200, minWidth: "120px" },
  barVal: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, minWidth: "28px", textAlign: "right" },
  listRow: {
    display: "flex", alignItems: "center", gap: "8px", padding: "6px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  quick: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" },
  quickBtn: { justifyContent: "flex-start" },
  link: { cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", color: ACCENTS.iris, fontSize: tokens.fontSizeBase200 },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: "100%", gap: "14px", color: tokens.colorNeutralForeground3, padding: "48px", textAlign: "center",
  },
});

function StatTile({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileVal} style={accent ? { color: accent } : undefined}>{value}</span>
      {sub && <span className={styles.tileSub}>{sub}</span>}
    </div>
  );
}

export default function DashboardPage({ onNavigate }: { onNavigate: (tool: ToolView) => void }) {
  const styles = useStyles();
  const { groups, filters } = useGroups();
  const {
    status, progress, phase, stats, emptyGroups, checkingEmpty, recent,
    scan, ensureLoaded, loadRecent,
  } = useDashboardStore();

  // Auto-load once per session (fires on first Home mount after login) and keep
  // the result cached across tab navigation until the user hits Rescan.
  useEffect(() => {
    ensureLoaded();
    loadRecent();
  }, [ensureLoaded, loadRecent]);

  const maxTypeCount = useMemo(() => Math.max(1, ...(stats?.byType.map((t) => t.count) ?? [1])), [stats]);
  const broadCount = stats ? new Set(stats.broadAssignments.map((b) => b.policyId)).size : 0;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Overview"
        title="Mission Control"
        subtitle="A live snapshot of your Intune tenant — coverage, risks and recent activity."
        icon={<PulseRegular />}
        actions={
          <Button
            appearance="primary"
            icon={status === "scanning" ? <Spinner size="extra-tiny" /> : <ScanRegular />}
            onClick={() => scan(true)}
            disabled={status === "scanning"}
          >
            {status === "scanning" ? "Scanning…" : status === "done" ? "Rescan" : "Scan tenant"}
          </Button>
        }
      />

      {status === "scanning" && !stats ? (
        <div className={styles.empty}>
          <Spinner size="large" />
          <Text weight="semibold">Scanning {phase}…</Text>
          <div style={{ width: 300 }}><ProgressBar value={progress / 100} /></div>
        </div>
      ) : !stats ? (
        <div className={styles.empty}>
          <PulseRegular style={{ fontSize: 48, color: ACCENTS.amber }} />
          <Text size={500} weight="semibold">Get a read on your tenant</Text>
          <Text size={300}>Scanning coverage, assignment health and risk widgets…</Text>
          <Button appearance="primary" icon={<ScanRegular />} onClick={() => scan(true)}>Scan tenant</Button>
        </div>
      ) : (
        <div className={styles.scroll}>
          {/* Stat tiles */}
          <div className={styles.tiles}>
            <StatTile label="Policies" value={stats.totalPolicies} sub={`${stats.assignedPolicies} assigned`} />
            <StatTile label="Groups targeted" value={stats.groupsTargeted} sub={`${groups.length} groups total`} />
            <StatTile label="Assignment filters" value={filters.length} />
            <StatTile label="Unassigned" value={stats.unassignedPolicies} accent={stats.unassignedPolicies ? ACCENTS.amber : undefined} sub="orphan policies" />
          </div>

          <div className={styles.grid}>
            {/* Assignment health */}
            <div className={styles.card}>
              <div className={styles.cardHead}><WarningFilled style={{ color: ACCENTS.amber }} /><span className={styles.cardTitle}>Assignment health</span></div>
              <div className={styles.healthRow}>
                <span className={styles.healthLeft}><AlertRegular /><Text size={300}>Unassigned policies</Text></span>
                <Badge color={stats.unassignedPolicies ? "warning" : "success"} appearance="tint">{stats.unassignedPolicies}</Badge>
              </div>
              <div className={styles.healthRow}>
                <span className={styles.healthLeft}><PeopleTeamRegular /><Text size={300}>Broad targets (All Users / Devices)</Text></span>
                <Badge color={broadCount ? "warning" : "success"} appearance="tint">{broadCount}</Badge>
              </div>
              <div className={styles.healthRow} style={{ borderBottom: "none" }}>
                <span className={styles.healthLeft}><PeopleTeamRegular /><Text size={300}>Empty targeted groups</Text></span>
                {checkingEmpty ? <Spinner size="extra-tiny" /> :
                  <Badge color={emptyGroups ? "danger" : "success"} appearance="tint">{emptyGroups ?? "—"}</Badge>}
              </div>
            </div>

            {/* Fleet by type */}
            <div className={styles.card}>
              <div className={styles.cardHead}><GridRegular /><span className={styles.cardTitle}>Policies by type</span></div>
              <div className={styles.bar}>
                {stats.byType.filter((t) => t.count > 0).map((t) => (
                  <div key={t.type} className={styles.barRow}>
                    <Text className={styles.barLabel}>{t.label}</Text>
                    <div className={styles.barTrack}>
                      <div className={styles.barFill} style={{ width: `${(t.count / maxTypeCount) * 100}%`, background: ACCENTS.iris }} />
                    </div>
                    <Text className={styles.barVal}>{t.count}</Text>
                  </div>
                ))}
              </div>
            </div>

            {/* Top groups */}
            <div className={styles.card}>
              <div className={styles.cardHead}><PeopleTeamRegular /><span className={styles.cardTitle}>Top groups by policy count</span></div>
              {stats.topGroups.length === 0 ? (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No group-targeted assignments.</Text>
              ) : stats.topGroups.map((g) => (
                <div key={g.groupId} className={styles.listRow}>
                  <Text size={300} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.groupName}</Text>
                  <Badge appearance="tint">{g.count}</Badge>
                </div>
              ))}
              <span className={styles.link} onClick={() => onNavigate("groupFinder")}>Open Group Finder <ChevronRightRegular /></span>
            </div>

            {/* Recent changes */}
            <div className={styles.card}>
              <div className={styles.cardHead}><HistoryRegular /><span className={styles.cardTitle}>Recent changes</span></div>
              {recent.length === 0 ? (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No recent audit activity.</Text>
              ) : recent.slice(0, 6).map((e) => (
                <div key={e.id} className={styles.listRow}>
                  <Badge appearance="tint" size="small" color={e.activityOperationType === "Delete" ? "danger" : e.activityOperationType === "Create" ? "success" : "warning"}>
                    {e.activityOperationType === "Patch" ? "Update" : e.activityOperationType || "—"}
                  </Badge>
                  <Text size={200} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.activityType || e.displayName}
                  </Text>
                </div>
              ))}
              <span className={styles.link} onClick={() => onNavigate("audit")}>Open Audit History <ChevronRightRegular /></span>
            </div>

            {/* Quick actions */}
            <div className={styles.card}>
              <div className={styles.cardHead}><ArrowSwapRegular /><span className={styles.cardTitle}>Quick actions</span></div>
              <div className={styles.quick}>
                <Button className={styles.quickBtn} appearance="subtle" icon={<DocumentTableRegular />} onClick={() => onNavigate("assignmentReport")}>Assignment Report</Button>
                <Button className={styles.quickBtn} appearance="subtle" icon={<GridRegular />} onClick={() => onNavigate("map")}>Assignment Matrix</Button>
                <Button className={styles.quickBtn} appearance="subtle" icon={<ArrowSwapRegular />} onClick={() => onNavigate("compareDeviceUser")}>Device + User Compare</Button>
                <Button className={styles.quickBtn} appearance="subtle" icon={<AlertRegular />} onClick={() => onNavigate("conflict")}>Conflict Detection</Button>
                <Button className={styles.quickBtn} appearance="subtle" icon={<ArrowSyncCircleRegular />} onClick={() => onNavigate("backup")}>Backup & Restore</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
