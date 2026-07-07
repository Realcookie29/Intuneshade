import { useState } from "react";
import {
  Button,
  Text,
  Badge,
  Card,
  CardHeader,
  Spinner,
  makeStyles,
  tokens,
  Tab,
  TabList,
  ProgressBar,
} from "@fluentui/react-components";
import {
  ScanTextRegular,
  ErrorCircleRegular,
  WarningRegular,
  InfoRegular,
  SparkleRegular,
  ArrowClockwiseRegular,
  ShieldErrorRegular,
  CheckmarkCircleRegular,
  DocumentSearchRegular,
  SettingsRegular,
  LinkRegular,
} from "@fluentui/react-icons";
import { useConflictStore } from "../../store/conflictStore";
import { useApiKeyStore } from "../../store/apiKeyStore";
import type { DetectedConflict, ConflictSeverity, ConflictType } from "../../utils/conflictDetection";

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    height: "100%",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    backgroundColor: tokens.colorNeutralBackground2,
  },

  // Hero banner
  hero: {
    padding: "32px 32px 28px",
    background: "linear-gradient(135deg, #0f3d6e 0%, #1565c0 55%, #1e88e5 100%)",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  heroTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  heroTitle: {
    fontSize: "26px",
    fontWeight: "700",
    color: "#fff",
    lineHeight: "1.2",
  },
  heroSubtitle: {
    fontSize: tokens.fontSizeBase300,
    color: "rgba(255,255,255,0.8)",
    marginTop: "4px",
  },
  scanBtn: {
    backgroundColor: "#fff",
    color: "#1565c0",
    fontWeight: tokens.fontWeightSemibold,
    flexShrink: 0,
    ":hover": { backgroundColor: "rgba(255,255,255,0.9)" },
  },

  // Stats row
  statsRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    padding: "20px 32px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  statCard: {
    flex: "1 1 120px",
    minWidth: "100px",
    padding: "16px",
    borderRadius: tokens.borderRadiusLarge,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  statValue: {
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: "1",
  },
  statLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },

  // Progress section
  progressSection: {
    padding: "16px 32px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  progressRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Content area
  content: {
    padding: "20px 32px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    flex: 1,
  },

  // Tabs
  tabBar: {
    marginBottom: "4px",
  },

  // Empty / idle states
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    padding: "64px 32px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "56px",
    color: tokens.colorNeutralForeground3,
    opacity: 0.5,
  },

  // Conflict cards
  conflictCard: {
    borderLeft: "4px solid",
    transition: "box-shadow 0.15s",
    ":hover": { boxShadow: tokens.shadow8 },
  },
  critical: { borderLeftColor: tokens.colorPaletteRedBorder2 },
  warning:  { borderLeftColor: tokens.colorPaletteYellowBorder2 },
  info:     { borderLeftColor: tokens.colorPaletteRoyalBlueBorderActive },

  conflictHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  conflictBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingTop: "4px",
  },
  conflictMeta: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    alignItems: "center",
  },
  metaItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },

  // Setting value comparison table
  valueTable: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    marginTop: "4px",
  },
  valueCell: {
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  valuePolicyName: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  valueText: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    fontFamily: "monospace",
  },

  // AI resolution
  resolution: {
    padding: "12px 14px",
    background: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    whiteSpace: "pre-wrap",
    fontSize: tokens.fontSizeBase200,
    lineHeight: "1.7",
    borderLeft: `3px solid ${tokens.colorBrandBackground}`,
  },
  resolveRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
});

// ─── Config ───────────────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<ConflictSeverity, { color: "danger" | "warning" | "informative"; icon: React.ReactElement; label: string }> = {
  critical: { color: "danger",      icon: <ErrorCircleRegular />, label: "Critical" },
  warning:  { color: "warning",     icon: <WarningRegular />,     label: "Warning"  },
  info:     { color: "informative", icon: <InfoRegular />,        label: "Info"     },
};

const TYPE_LABEL: Record<ConflictType, string> = {
  setting_value:   "Setting Value Conflict",
  include_exclude: "Include / Exclude Conflict",
  intent:          "App Intent Conflict",
  duplicate:       "Duplicate Assignment",
  redundant:       "Redundant Assignment",
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ value, label, color }: { value: number; label: string; color?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue} style={{ color: color ?? tokens.colorNeutralForeground1 }}>
        {value}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

// ─── Conflict Card ─────────────────────────────────────────────────────────────

function ConflictCard({ conflict }: { conflict: DetectedConflict }) {
  const styles = useStyles();
  const { resolutions, resolvingId, resolveWithAI } = useConflictStore();
  const { apiKey, openDialog } = useApiKeyStore();
  const cfg = SEVERITY_CFG[conflict.severity];
  const resolution = resolutions[conflict.id];
  const isResolving = resolvingId === conflict.id;

  const handleResolve = () => {
    if (!apiKey) { openDialog(); return; }
    resolveWithAI(conflict, apiKey);
  };

  return (
    <Card className={`${styles.conflictCard} ${styles[conflict.severity]}`} size="small">
      <CardHeader
        header={
          <div className={styles.conflictHeader}>
            <Badge color={cfg.color} icon={cfg.icon} appearance="filled" size="small">
              {cfg.label}
            </Badge>
            <Text weight="semibold" size={300}>{TYPE_LABEL[conflict.type]}</Text>
          </div>
        }
      />
      <div className={styles.conflictBody}>

        {/* Setting value comparison */}
        {conflict.type === "setting_value" && conflict.conflictingValues && (
          <>
            <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
              Setting: <strong>{conflict.settingName}</strong>
            </Text>
            <div className={styles.valueTable}>
              {conflict.conflictingValues.map((v) => (
                <div key={v.policyId} className={styles.valueCell}>
                  <span className={styles.valuePolicyName} title={v.policyName}>{v.policyName}</span>
                  <span className={styles.valueText}>{v.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Description */}
        <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
          {conflict.description}
        </Text>

        {/* Meta */}
        <div className={styles.conflictMeta}>
          <span className={styles.metaItem}>
            <LinkRegular style={{ fontSize: 14 }} />
            Group: <strong style={{ color: tokens.colorNeutralForeground1 }}>{conflict.groupName}</strong>
          </span>
          {conflict.type !== "setting_value" && (
            <span className={styles.metaItem}>
              <SettingsRegular style={{ fontSize: 14 }} />
              {conflict.policyName}
            </span>
          )}
        </div>

        {/* AI resolution */}
        {resolution ? (
          <div className={styles.resolution}>{resolution}</div>
        ) : (
          <div className={styles.resolveRow}>
            <Button
              size="small"
              appearance="outline"
              icon={isResolving ? <Spinner size="tiny" /> : <SparkleRegular />}
              onClick={handleResolve}
              disabled={isResolving}
            >
              {isResolving ? "Analyzing…" : "Resolve with AI"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type TabKey = "all" | "settings" | "assignments";

export default function ConflictDashboard() {
  const styles = useStyles();
  const { conflicts, scanStatus, scanProgress, scanPhase, policiesScanned, lastScannedAt, scan } = useConflictStore();
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const critical   = conflicts.filter((c) => c.severity === "critical");
  const warnings   = conflicts.filter((c) => c.severity === "warning");
  const infos      = conflicts.filter((c) => c.severity === "info");
  const settingConflicts    = conflicts.filter((c) => c.type === "setting_value");
  const assignmentConflicts = conflicts.filter((c) => c.type !== "setting_value");

  const displayed =
    activeTab === "settings"    ? settingConflicts :
    activeTab === "assignments" ? assignmentConflicts :
    conflicts;

  const lastScanned = lastScannedAt
    ? new Date(lastScannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const isScanning = scanStatus === "scanning";
  const isDone     = scanStatus === "done";

  return (
    <div className={styles.root}>

      {/* Hero Banner */}
      <div className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <ShieldErrorRegular style={{ fontSize: 28, color: "#fff" }} />
              <Text className={styles.heroTitle}>Policy Conflict Detection</Text>
            </div>
            <Text className={styles.heroSubtitle}>
              Scan your entire Intune environment for setting-level and assignment conflicts
            </Text>
            {lastScanned && (
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 6, display: "block" }}>
                Last scan: {lastScanned}
              </Text>
            )}
          </div>
          <Button
            className={styles.scanBtn}
            icon={isScanning ? <Spinner size="tiny" /> : isDone ? <ArrowClockwiseRegular /> : <ScanTextRegular />}
            onClick={scan}
            disabled={isScanning}
            size="large"
          >
            {isScanning ? "Scanning…" : isDone ? "Re-scan" : "Scan All Policies"}
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {isScanning && (
        <div className={styles.progressSection}>
          <div className={styles.progressRow}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>{scanPhase}</Text>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{scanProgress}%</Text>
          </div>
          <ProgressBar value={scanProgress / 100} thickness="large" />
        </div>
      )}

      {/* Stat Cards */}
      {(isDone || isScanning) && (
        <div className={styles.statsRow}>
          <StatCard value={policiesScanned} label="Policies Scanned" />
          <StatCard value={conflicts.length} label="Total Conflicts"
            color={conflicts.length > 0 ? tokens.colorPaletteRedForeground2 : tokens.colorPaletteGreenForeground1} />
          <StatCard value={critical.length} label="Critical"
            color={critical.length > 0 ? tokens.colorPaletteRedForeground2 : tokens.colorNeutralForeground3} />
          <StatCard value={warnings.length} label="Warnings"
            color={warnings.length > 0 ? tokens.colorPaletteYellowForeground2 : tokens.colorNeutralForeground3} />
          <StatCard value={infos.length} label="Info"
            color={tokens.colorNeutralForeground3} />
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>

        {/* Idle state */}
        {scanStatus === "idle" && (
          <div className={styles.emptyState}>
            <DocumentSearchRegular className={styles.emptyIcon} />
            <Text size={500} weight="semibold">Ready to scan</Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3, maxWidth: 400 }}>
              Click <strong>Scan All Policies</strong> to check all 10 Intune policy types for setting-value
              conflicts and assignment issues. Settings Catalog policies are also compared at the individual
              setting level — the same way Intune detects conflicts.
            </Text>
          </div>
        )}

        {/* No conflicts */}
        {isDone && conflicts.length === 0 && (
          <div className={styles.emptyState}>
            <CheckmarkCircleRegular style={{ fontSize: 56, color: tokens.colorPaletteGreenForeground1 }} />
            <Text size={500} weight="semibold" style={{ color: tokens.colorPaletteGreenForeground1 }}>
              No conflicts found
            </Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              All {policiesScanned} policies scanned — assignments and settings look clean.
            </Text>
          </div>
        )}

        {/* Conflict list */}
        {isDone && conflicts.length > 0 && (
          <>
            <TabList
              className={styles.tabBar}
              selectedValue={activeTab}
              onTabSelect={(_, d) => setActiveTab(d.value as TabKey)}
            >
              <Tab value="all">All ({conflicts.length})</Tab>
              <Tab value="settings">Setting Conflicts ({settingConflicts.length})</Tab>
              <Tab value="assignments">Assignment Conflicts ({assignmentConflicts.length})</Tab>
            </TabList>

            {displayed.length === 0 ? (
              <div className={styles.emptyState} style={{ padding: "40px 0" }}>
                <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                  No conflicts in this category.
                </Text>
              </div>
            ) : (
              displayed.map((c) => <ConflictCard key={c.id} conflict={c} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
