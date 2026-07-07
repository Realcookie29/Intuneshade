import { useState, useCallback } from "react";
import {
  makeStyles, tokens, Text, Button, ProgressBar,
  Badge, Divider,
  MessageBar, MessageBarBody,
} from "@fluentui/react-components";
import {
  ShieldCheckmark24Regular, ShieldError24Regular,
  ArrowClockwise24Regular, DocumentBulletList24Regular,
  CheckmarkCircle24Regular, Warning24Regular,
  ErrorCircle24Regular, Info24Regular,
} from "@fluentui/react-icons";
import {
  scanTenant, generateComplianceReport,
} from "../../services/complianceService";
import type {
  TenantSummary, ComplianceReport, ScanProgress,
} from "../../services/complianceService";
import { useApiKeyStore } from "../../store/apiKeyStore";

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    padding: "24px 32px 20px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 32px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  // ── Empty / scan state ────────────────────────────────────────────────────
  emptyHero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "16px",
    color: tokens.colorNeutralForeground3,
    paddingBottom: "80px",
  },
  scanProgress: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxWidth: "480px",
    margin: "0 auto",
    padding: "40px 0",
  },
  // ── Risk level badge ──────────────────────────────────────────────────────
  riskBanner: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "20px 24px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  riskBannerLow: {
    backgroundColor: tokens.colorStatusSuccessBackground1,
  },
  riskBannerMedium: {
    backgroundColor: tokens.colorStatusWarningBackground1,
  },
  riskBannerHigh: {
    backgroundColor: tokens.colorStatusDangerBackground1,
  },
  riskBannerCritical: {
    backgroundColor: tokens.colorStatusDangerBackground1,
  },
  riskText: {
    flex: 1,
  },
  // ── Stats grid ────────────────────────────────────────────────────────────
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "12px",
  },
  statCard: {
    display: "flex",
    flexDirection: "column",
    padding: "16px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    gap: "4px",
  },
  statValue: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: "1",
    color: tokens.colorBrandForeground1,
  },
  statLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  // ── Sections ──────────────────────────────────────────────────────────────
  sectionCard: {
    padding: "20px 24px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  sectionContent: {
    color: tokens.colorNeutralForeground1,
    lineHeight: "1.6",
    whiteSpace: "pre-wrap",
  },
  // ── Action items ──────────────────────────────────────────────────────────
  actionList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  actionItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  actionItemHigh: {
    backgroundColor: tokens.colorStatusDangerBackground1,
  },
  actionItemMedium: {
    backgroundColor: tokens.colorStatusWarningBackground1,
  },
  // ── Type breakdown table ──────────────────────────────────────────────────
  typeTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: tokens.fontSizeBase300,
  },
  typeTableTh: {
    textAlign: "left" as const,
    padding: "8px 12px",
    borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
  },
  typeTableTd: {
    padding: "8px 12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "middle" as const,
  },
  typeTableTr: {
    ":hover": { backgroundColor: tokens.colorNeutralBackground2 },
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function RiskIcon({ level }: { level: ComplianceReport["riskLevel"] }) {
  if (level === "low") return <ShieldCheckmark24Regular style={{ color: tokens.colorStatusSuccessForeground1 }} />;
  if (level === "medium") return <Warning24Regular style={{ color: tokens.colorStatusWarningForeground1 }} />;
  return <ShieldError24Regular style={{ color: tokens.colorStatusDangerForeground1 }} />;
}

function RiskBadge({ level }: { level: ComplianceReport["riskLevel"] }) {
  const colorMap: Record<ComplianceReport["riskLevel"], "success" | "warning" | "danger" | "important"> = {
    low: "success",
    medium: "warning",
    high: "danger",
    critical: "important",
  };
  return (
    <Badge appearance="filled" color={colorMap[level]} size="large">
      {level.toUpperCase()} RISK
    </Badge>
  );
}

function PriorityIcon({ priority }: { priority: "high" | "medium" | "low" }) {
  if (priority === "high") return <ErrorCircle24Regular style={{ color: tokens.colorStatusDangerForeground1, flexShrink: 0 }} />;
  if (priority === "medium") return <Warning24Regular style={{ color: tokens.colorStatusWarningForeground1, flexShrink: 0 }} />;
  return <Info24Regular style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }} />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ComplianceReportPage() {
  const styles = useStyles();
  const { apiKey, openDialog: openApiKeyDialog } = useApiKeyStore();

  const [phase, setPhase] = useState<"idle" | "scanning" | "generating" | "done" | "error">("idle");
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ label: "", done: 0, total: 10 });
  const [tenantSummary, setTenantSummary] = useState<TenantSummary | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!apiKey) {
      openApiKeyDialog();
      return;
    }
    setPhase("scanning");
    setError(null);
    setReport(null);

    try {
      const summary = await scanTenant((p) => setScanProgress(p));
      setTenantSummary(summary);

      setPhase("generating");
      const result = await generateComplianceReport(summary, apiKey);
      setReport(result);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [apiKey, openApiKeyDialog]);

  const handleRegenerate = useCallback(() => {
    setPhase("idle");
    setReport(null);
    setTenantSummary(null);
  }, []);

  // ── Render: scanning / generating ────────────────────────────────────────

  if (phase === "scanning" || phase === "generating") {
    const progressValue = phase === "scanning"
      ? (scanProgress.done / scanProgress.total) * 0.8
      : 0.95;

    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <DocumentBulletList24Regular style={{ fontSize: "24px", color: tokens.colorBrandForeground1 }} />
            <Text size={600} weight="semibold">Compliance Report</Text>
          </div>
        </div>
        <div className={styles.scrollArea}>
          <div className={styles.scanProgress}>
            <Text size={500} weight="semibold" align="center">
              {phase === "scanning" ? "Scanning tenant…" : "Generating AI report…"}
            </Text>
            <ProgressBar value={progressValue} />
            <Text size={300} align="center" style={{ color: tokens.colorNeutralForeground3 }}>
              {phase === "scanning"
                ? `${scanProgress.label} (${scanProgress.done} / ${scanProgress.total})`
                : "Analyzing policy posture with Claude AI…"}
            </Text>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <DocumentBulletList24Regular style={{ fontSize: "24px", color: tokens.colorBrandForeground1 }} />
            <Text size={600} weight="semibold">Compliance Report</Text>
          </div>
          <Button
            appearance="secondary"
            icon={<ArrowClockwise24Regular />}
            onClick={handleRegenerate}
          >
            Try Again
          </Button>
        </div>
        <div className={styles.scrollArea}>
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        </div>
      </div>
    );
  }

  // ── Render: idle (empty state) ────────────────────────────────────────────

  if (phase === "idle") {
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <DocumentBulletList24Regular style={{ fontSize: "24px", color: tokens.colorBrandForeground1 }} />
            <Text size={600} weight="semibold">Compliance Report</Text>
          </div>
          <Button
            appearance="primary"
            icon={<ShieldCheckmark24Regular />}
            onClick={handleGenerate}
          >
            Generate Report
          </Button>
        </div>
        <div className={styles.scrollArea}>
          <div className={styles.emptyHero}>
            <DocumentBulletList24Regular style={{ fontSize: "64px", opacity: 0.25 }} />
            <Text size={500} weight="semibold">Tenant Compliance Posture Report</Text>
            <Text size={300} align="center" style={{ maxWidth: "420px" }}>
              Scans all 10 Intune policy types across your tenant, then uses Claude AI to
              produce an executive-level compliance narrative with prioritized action items.
            </Text>
            <Button
              appearance="primary"
              size="large"
              icon={<ShieldCheckmark24Regular />}
              onClick={handleGenerate}
            >
              Generate Report
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: done ──────────────────────────────────────────────────────────

  if (!report || !tenantSummary) return null;

  const riskBannerClass = {
    low: styles.riskBannerLow,
    medium: styles.riskBannerMedium,
    high: styles.riskBannerHigh,
    critical: styles.riskBannerCritical,
  }[report.riskLevel];

  const totalUnassigned = tenantSummary.byType.reduce((sum, t) => sum + t.unassignedCount, 0);
  const totalAllUsers = tenantSummary.byType.reduce((sum, t) => sum + t.allUsersCount, 0);
  const totalAllDevices = tenantSummary.byType.reduce((sum, t) => sum + t.allDevicesCount, 0);
  const totalGroup = tenantSummary.byType.reduce((sum, t) => sum + t.groupAssignedCount, 0);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <DocumentBulletList24Regular style={{ fontSize: "24px", color: tokens.colorBrandForeground1 }} />
          <Text size={600} weight="semibold">Compliance Report</Text>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Scanned {new Date(tenantSummary.scannedAt).toLocaleString()}
          </Text>
        </div>
        <Button
          appearance="secondary"
          icon={<ArrowClockwise24Regular />}
          onClick={handleRegenerate}
        >
          Rescan
        </Button>
      </div>

      <div className={styles.scrollArea}>
        {/* Risk banner */}
        <div className={`${styles.riskBanner} ${riskBannerClass}`}>
          <RiskIcon level={report.riskLevel} />
          <div className={styles.riskText}>
            <RiskBadge level={report.riskLevel} />
            <Text size={300} block style={{ marginTop: "6px" }}>{report.executiveSummary}</Text>
          </div>
        </div>

        {/* Stats */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <Text className={styles.statValue}>{tenantSummary.totalPolicies}</Text>
            <Text className={styles.statLabel}>Total Policies</Text>
          </div>
          <div className={styles.statCard}>
            <Text className={styles.statValue}>{totalUnassigned}</Text>
            <Text className={styles.statLabel}>Unassigned</Text>
          </div>
          <div className={styles.statCard}>
            <Text className={styles.statValue}>{totalGroup}</Text>
            <Text className={styles.statLabel}>Group Targeted</Text>
          </div>
          <div className={styles.statCard}>
            <Text className={styles.statValue}>{totalAllUsers}</Text>
            <Text className={styles.statLabel}>All Users</Text>
          </div>
          <div className={styles.statCard}>
            <Text className={styles.statValue}>{totalAllDevices}</Text>
            <Text className={styles.statLabel}>All Devices</Text>
          </div>
          <div className={styles.statCard}>
            <Text className={styles.statValue}>{tenantSummary.byType.filter(t => t.count > 0).length}</Text>
            <Text className={styles.statLabel}>Policy Types Used</Text>
          </div>
        </div>

        {/* AI sections */}
        {report.sections.map((section, i) => (
          <div key={i} className={styles.sectionCard}>
            <Text size={400} weight="semibold">{section.title}</Text>
            <Divider />
            <Text size={300} className={styles.sectionContent}>{section.content}</Text>
          </div>
        ))}

        {/* Action items */}
        {report.actionItems.length > 0 && (
          <div className={styles.sectionCard}>
            <Text size={400} weight="semibold">Prioritized Action Items</Text>
            <Divider />
            <div className={styles.actionList}>
              {report.actionItems.map((item, i) => (
                <div
                  key={i}
                  className={`${styles.actionItem} ${item.priority === "high" ? styles.actionItemHigh : item.priority === "medium" ? styles.actionItemMedium : ""}`}
                >
                  <PriorityIcon priority={item.priority} />
                  <Text size={300}>{item.text}</Text>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-type breakdown */}
        <div className={styles.sectionCard}>
          <Text size={400} weight="semibold">Policy Type Breakdown</Text>
          <Divider />
          <table className={styles.typeTable}>
            <thead>
              <tr>
                <th className={styles.typeTableTh}>Type</th>
                <th className={styles.typeTableTh} style={{ textAlign: "right" }}>Total</th>
                <th className={styles.typeTableTh} style={{ textAlign: "right" }}>Unassigned</th>
                <th className={styles.typeTableTh} style={{ textAlign: "right" }}>All Users</th>
                <th className={styles.typeTableTh} style={{ textAlign: "right" }}>All Devices</th>
                <th className={styles.typeTableTh} style={{ textAlign: "right" }}>Group</th>
              </tr>
            </thead>
            <tbody>
              {tenantSummary.byType.map((t) => (
                <tr key={t.type} className={styles.typeTableTr}>
                  <td className={styles.typeTableTd}>
                    <Text size={300} weight={t.unassignedCount > 0 ? "semibold" : "regular"}>{t.label}</Text>
                    {t.unassignedCount > 0 && (
                      <Badge
                        appearance="filled"
                        color="danger"
                        size="small"
                        style={{ marginLeft: "8px" }}
                      >
                        {t.unassignedCount} unassigned
                      </Badge>
                    )}
                  </td>
                  <td className={styles.typeTableTd} style={{ textAlign: "right" }}><Text size={300}>{t.count}</Text></td>
                  <td className={styles.typeTableTd} style={{ textAlign: "right" }}>
                    <Text size={300} style={{ color: t.unassignedCount > 0 ? tokens.colorStatusDangerForeground1 : undefined }}>
                      {t.unassignedCount}
                    </Text>
                  </td>
                  <td className={styles.typeTableTd} style={{ textAlign: "right" }}><Text size={300}>{t.allUsersCount}</Text></td>
                  <td className={styles.typeTableTd} style={{ textAlign: "right" }}><Text size={300}>{t.allDevicesCount}</Text></td>
                  <td className={styles.typeTableTd} style={{ textAlign: "right" }}><Text size={300}>{t.groupAssignedCount}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unassigned policy list (if any) */}
        {tenantSummary.unassignedPolicies.length > 0 && (
          <div className={styles.sectionCard}>
            <Text size={400} weight="semibold">
              Unassigned Policies ({tenantSummary.unassignedPolicies.length})
            </Text>
            <Divider />
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "280px", overflowY: "auto" }}>
              {tenantSummary.unassignedPolicies.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
                  <CheckmarkCircle24Regular style={{ color: tokens.colorStatusDangerForeground1, flexShrink: 0, fontSize: "16px" }} />
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }}>{p.label}</Text>
                  <Text size={300}>{p.name}</Text>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
