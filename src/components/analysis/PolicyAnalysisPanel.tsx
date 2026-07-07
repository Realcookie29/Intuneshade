import { useState } from "react";
import {
  Button,
  Text,
  Badge,
  Divider,
  Skeleton,
  SkeletonItem,
  makeStyles,
  tokens,
  Select,
  Textarea,
} from "@fluentui/react-components";
import {
  DismissRegular,
  SparkleRegular,
  ShieldErrorRegular,
  LightbulbRegular,
  DocumentTextRegular,
  CopyRegular,
  CheckmarkRegular,
  CodeRegular,
} from "@fluentui/react-icons";
import { useAnalysisStore } from "../../store/analysisStore";
import type { RiskItem, RecommendationItem } from "../../store/analysisStore";

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  panel: {
    width: "400px",
    flexShrink: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  scroll: {
    flex: 1,
    overflowY: "auto",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  summaryBox: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: "6px",
    padding: "14px",
    lineHeight: "1.6",
    fontSize: tokens.fontSizeBase300,
  },
  riskCard: {
    borderRadius: "6px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    borderLeft: "4px solid",
  },
  riskCritical: {
    backgroundColor: tokens.colorStatusDangerBackground1,
    borderLeftColor: tokens.colorStatusDangerForeground1,
  },
  riskWarning: {
    backgroundColor: tokens.colorStatusWarningBackground1,
    borderLeftColor: tokens.colorStatusWarningForeground1,
  },
  riskInfo: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderLeftColor: tokens.colorNeutralStroke1,
  },
  riskTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
  },
  riskDesc: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: "1.5",
  },
  recCard: {
    borderRadius: "6px",
    padding: "12px",
    backgroundColor: tokens.colorNeutralBackground3,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    borderLeft: "4px solid",
  },
  recHigh: { borderLeftColor: tokens.colorBrandForeground1 },
  recMedium: { borderLeftColor: tokens.colorStatusWarningForeground1 },
  recLow: { borderLeftColor: tokens.colorNeutralStroke1 },
  recTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recDesc: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: "1.5",
  },
  timestamp: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
    textAlign: "right" as const,
  },
  errorBox: {
    backgroundColor: tokens.colorStatusDangerBackground1,
    borderRadius: "6px",
    padding: "14px",
    color: tokens.colorStatusDangerForeground1,
    fontSize: tokens.fontSizeBase300,
  },
  // Script panel
  scriptForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "20px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  codeBlock: {
    backgroundColor: "#1e1e1e",
    borderRadius: "6px",
    padding: "14px",
    fontFamily: "Consolas, monospace",
    fontSize: "12px",
    color: "#d4d4d4",
    overflowX: "auto",
    whiteSpace: "pre",
    lineHeight: "1.5",
    maxHeight: "280px",
    overflowY: "auto",
  },
  copyBtn: {
    alignSelf: "flex-end",
  },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskCard({ risk }: { risk: RiskItem }) {
  const styles = useStyles();
  const cardClass =
    risk.severity === "critical"
      ? styles.riskCritical
      : risk.severity === "warning"
        ? styles.riskWarning
        : styles.riskInfo;

  const color =
    risk.severity === "critical" ? "danger" : risk.severity === "warning" ? "warning" : "informative";

  return (
    <div className={`${styles.riskCard} ${cardClass}`}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
        <Badge appearance="filled" color={color} size="small">
          {risk.severity.toUpperCase()}
        </Badge>
        <Text className={styles.riskTitle}>{risk.title}</Text>
      </div>
      <Text className={styles.riskDesc}>{risk.description}</Text>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: RecommendationItem }) {
  const styles = useStyles();
  const cardClass =
    rec.priority === "high" ? styles.recHigh : rec.priority === "medium" ? styles.recMedium : styles.recLow;

  const priorityColor =
    rec.priority === "high" ? "brand" : rec.priority === "medium" ? "warning" : "subtle";

  return (
    <div className={`${styles.recCard} ${cardClass}`}>
      <div className={styles.recTitle}>
        <Text style={{ fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200 }}>
          {rec.title}
        </Text>
        <Badge appearance="ghost" color={priorityColor as "brand" | "warning"} size="small">
          {rec.priority}
        </Badge>
      </div>
      <Text className={styles.recDesc}>{rec.description}</Text>
    </div>
  );
}

function SkeletonLoader() {
  const styles = useStyles();
  return (
    <div className={styles.scroll}>
      <Skeleton>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <SkeletonItem size={16} style={{ width: "60%" }} />
          <SkeletonItem size={12} />
          <SkeletonItem size={12} />
          <SkeletonItem size={12} style={{ width: "80%" }} />
        </div>
      </Skeleton>
      <Skeleton>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <SkeletonItem size={16} style={{ width: "40%" }} />
          <SkeletonItem size={48} />
          <SkeletonItem size={48} />
        </div>
      </Skeleton>
      <Skeleton>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <SkeletonItem size={16} style={{ width: "50%" }} />
          <SkeletonItem size={48} />
        </div>
      </Skeleton>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function PolicyAnalysisPanel() {
  const styles = useStyles();
  const {
    panelOpen,
    currentKey,
    status,
    error,
    cache,
    closePanel,
    scriptPanelOpen,
    scriptResult,
    scriptStatus,
    scriptError,
    generateScript,
    closeScriptPanel,
  } = useAnalysisStore();

  const [copied, setCopied] = useState(false);
  const [scriptDesc, setScriptDesc] = useState("");
  const [scriptType, setScriptType] = useState<"powershell" | "graph">("powershell");

  const result = currentKey ? cache[currentKey] : null;

  const handleCopy = async () => {
    if (!scriptResult?.script) return;
    await navigator.clipboard.writeText(scriptResult.script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!panelOpen && !scriptPanelOpen) return null;

  return (
    <div className={styles.panel}>
      {/* Analysis panel */}
      {panelOpen && (
        <>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <SparkleRegular fontSize={18} style={{ color: tokens.colorBrandForeground1 }} />
              <Text weight="semibold" size={400}>AI Analysis</Text>
              <Badge appearance="tint" color="brand" size="small">AI-generated</Badge>
            </div>
            <Button
              appearance="transparent"
              size="small"
              icon={<DismissRegular />}
              onClick={closePanel}
            />
          </div>

          {status === "loading" && <SkeletonLoader />}

          {status === "error" && (
            <div className={styles.scroll}>
              <div className={styles.errorBox}>{error}</div>
            </div>
          )}

          {status === "success" && result && (
            <div className={styles.scroll}>
              {/* Summary */}
              <div className={styles.section}>
                <Text className={styles.sectionTitle}>
                  <DocumentTextRegular />
                  Summary
                </Text>
                <div className={styles.summaryBox}>
                  <Text size={300}>{result.summary}</Text>
                </div>
              </div>

              <Divider />

              {/* Risks */}
              <div className={styles.section}>
                <Text className={styles.sectionTitle}>
                  <ShieldErrorRegular />
                  Risks & Issues
                  {result.risks.length > 0 && (
                    <Badge
                      appearance="filled"
                      color={result.risks.some((r) => r.severity === "critical") ? "danger" : "warning"}
                      size="small"
                    >
                      {result.risks.length}
                    </Badge>
                  )}
                </Text>
                {result.risks.length === 0 ? (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    No risks detected.
                  </Text>
                ) : (
                  result.risks.map((r, i) => <RiskCard key={i} risk={r} />)
                )}
              </div>

              <Divider />

              {/* Recommendations */}
              <div className={styles.section}>
                <Text className={styles.sectionTitle}>
                  <LightbulbRegular />
                  Recommendations
                </Text>
                {result.recommendations.length === 0 ? (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    No recommendations.
                  </Text>
                ) : (
                  result.recommendations.map((r, i) => <RecommendationCard key={i} rec={r} />)
                )}
              </div>

              <Text className={styles.timestamp}>
                Analyzed {new Date(result.analyzedAt).toLocaleTimeString()}
              </Text>
            </div>
          )}
        </>
      )}

      {/* Script generator panel */}
      {scriptPanelOpen && (
        <>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <CodeRegular fontSize={18} style={{ color: tokens.colorBrandForeground1 }} />
              <Text weight="semibold" size={400}>Script Generator</Text>
              <Badge appearance="tint" color="brand" size="small">AI-generated</Badge>
            </div>
            <Button
              appearance="transparent"
              size="small"
              icon={<DismissRegular />}
              onClick={closeScriptPanel}
            />
          </div>

          <div className={styles.scriptForm}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
              Describe what you want the script to do in plain English.
            </Text>
            <Textarea
              placeholder="e.g. Assign the Contoso-Compliance policy to the Marketing group for all Android devices"
              value={scriptDesc}
              onChange={(_, d) => setScriptDesc(d.value)}
              rows={4}
            />
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Select
                value={scriptType}
                onChange={(_, d) => setScriptType(d.value as "powershell" | "graph")}
                style={{ flex: 1 }}
              >
                <option value="powershell">PowerShell (Graph SDK)</option>
                <option value="graph">Graph API (HTTP/curl)</option>
              </Select>
              <Button
                appearance="primary"
                disabled={!scriptDesc.trim() || scriptStatus === "loading"}
                onClick={() => generateScript(scriptDesc, scriptType)}
              >
                {scriptStatus === "loading" ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>

          <div className={styles.scroll}>
            {scriptStatus === "loading" && <SkeletonLoader />}

            {scriptStatus === "error" && (
              <div className={styles.errorBox}>{scriptError}</div>
            )}

            {scriptStatus === "success" && scriptResult && (
              <div className={styles.section}>
                <div className={styles.summaryBox}>
                  <Text size={200}>{scriptResult.explanation}</Text>
                </div>
                <div className={styles.codeBlock}>{scriptResult.script}</div>
                <Button
                  className={styles.copyBtn}
                  appearance="subtle"
                  size="small"
                  icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
                  onClick={handleCopy}
                >
                  {copied ? "Copied!" : "Copy script"}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
