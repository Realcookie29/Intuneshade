import { useState, useRef } from "react";
import {
  Button, Text, Spinner, Input, Badge,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  SearchRegular,
  DocumentSearchRegular,
  DismissRegular,
  ChevronDownRegular,
  ChevronUpRegular,
} from "@fluentui/react-icons";
import {
  searchPolicySettings,
  type PolicySearchResult,
  type AssignmentInfo,
} from "../../services/settingsSearchService";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";
import type { PolicyType } from "../../types/policyTypes";
import PageHeader from "../layout/PageHeader";

// ─── Colour palette ───────────────────────────────────────────────────────────

const TYPE_COLORS: Record<PolicyType, string> = {
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    overflow: "hidden",
  },
  hero: {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)",
    padding: "24px 32px 20px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "24px",
    flexShrink: 0,
  },
  heroLeft: { display: "flex", flexDirection: "column", gap: "4px" },
  heroTitle: { color: "white", fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: tokens.fontSizeBase300 },
  heroExamples: {
    color: "rgba(255,255,255,0.45)",
    fontSize: tokens.fontSizeBase200,
    marginTop: "6px",
  },
  searchBar: {
    padding: "16px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexShrink: 0,
  },
  statsRow: {
    display: "flex",
    gap: "24px",
    padding: "10px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    alignItems: "center",
    flexWrap: "wrap",
    flexShrink: 0,
  },
  stat: { display: "flex", flexDirection: "column", gap: "1px" },
  statVal: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  statLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  content: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "16px 24px",
  },
  resultsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "100%",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "300px",
    color: tokens.colorNeutralForeground3,
    gap: "12px",
    textAlign: "center",
  },
  progressWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "300px",
    gap: "16px",
  },
  // ─── Card ────────────────────────────────────────────────────────────────────
  card: {
    width: "100%",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "visible",
  },
  cardToggleBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 16px",
    cursor: "pointer",
    border: "none",
    background: "transparent",
    textAlign: "left",
    borderRadius: "8px",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  cardToggleBtnCollapsed: {
    borderRadius: "8px",
  },
  cardToggleBtnExpanded: {
    borderRadius: "8px 8px 0 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  cardHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
    flex: 1,
  },
  cardHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  policyName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  policyDesc: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  typePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: "white",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  // ─── Settings table ───────────────────────────────────────────────────────────
  tableWrap: {
    overflowX: "auto",
    width: "100%",
    borderRadius: "0 0 8px 8px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    padding: "8px 16px",
    backgroundColor: tokens.colorNeutralBackground3,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    textAlign: "left",
    whiteSpace: "nowrap",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  td: {
    padding: "9px 16px",
    verticalAlign: "top",
    fontSize: tokens.fontSizeBase300,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  tdName: {
    fontWeight: tokens.fontWeightMedium,
    width: "42%",
    minWidth: "200px",
  },
  tdValue: {
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    wordBreak: "break-word",
  },
  noSettings: {
    padding: "10px 16px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontStyle: "italic",
    borderRadius: "0 0 8px 8px",
  },
  groupsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    padding: "6px 16px 10px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  groupPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightMedium,
    whiteSpace: "nowrap",
  },
  noGroups: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
    fontStyle: "italic",
    padding: "6px 16px 10px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
  },
});

// ─── Highlight text helper (no hooks) ────────────────────────────────────────

function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text.toLowerCase().includes(query.toLowerCase())) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ backgroundColor: "#fff3cd", borderRadius: 2, padding: "0 1px", fontWeight: 600 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Group pill colours ───────────────────────────────────────────────────────

const ASSIGNMENT_COLORS: Record<AssignmentInfo["assignmentType"], { bg: string; text: string }> = {
  "Include":    { bg: "#dce9ff", text: "#0f4a94" },
  "Exclude":    { bg: "#fde7e9", text: "#8e1b1b" },
  "All Users":  { bg: "#dff6dd", text: "#0e5c0e" },
  "All Devices":{ bg: "#e8f4fd", text: "#004e8c" },
};

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ result, query }: { result: PolicySearchResult; query: string }) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const def = POLICY_DEFINITIONS.find((d) => d.type === result.policyType);
  const color = TYPE_COLORS[result.policyType];

  return (
    <div className={styles.card}>
      {/* Toggle button — full-width, keyboard accessible */}
      <button
        type="button"
        className={`${styles.cardToggleBtn} ${expanded ? styles.cardToggleBtnExpanded : styles.cardToggleBtnCollapsed}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className={styles.cardHeaderLeft}>
          <span className={styles.typePill} style={{ backgroundColor: color }}>
            {def?.label ?? result.policyType}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className={styles.policyName}>
              {highlightText(result.policyName, query)}
            </div>
            {result.policyDescription && (
              <div className={styles.policyDesc}>{result.policyDescription}</div>
            )}
          </div>
        </div>

        <div className={styles.cardHeaderRight}>
          {result.matches.length > 0 && (
            <Badge appearance="filled" color="brand" size="small">
              {result.matches.length} {result.matches.length === 1 ? "setting" : "settings"}
            </Badge>
          )}
          {expanded ? <ChevronUpRegular fontSize={16} /> : <ChevronDownRegular fontSize={16} />}
        </div>
      </button>

      {/* Groups — always visible */}
      {result.assignments.length > 0 ? (
        <div className={styles.groupsRow}>
          {result.assignments.map((a, i) => {
            const colors = ASSIGNMENT_COLORS[a.assignmentType] ?? { bg: "#f0f0f0", text: "#333" };
            return (
              <span
                key={i}
                className={styles.groupPill}
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {a.assignmentType !== "Include" && a.assignmentType !== "Exclude" ? null : (
                  <span style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase" }}>
                    {a.assignmentType === "Exclude" ? "✕" : ""}
                  </span>
                )}
                {a.groupName}
              </span>
            );
          })}
        </div>
      ) : (
        <div className={styles.noGroups}>Geen groepen gekoppeld</div>
      )}

      {/* Expanded body */}
      {expanded && (
        result.matches.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={`${styles.th} ${styles.tdName}`}>Setting</th>
                  <th className={styles.th}>Value</th>
                </tr>
              </thead>
              <tbody>
                {result.matches.map((m, i) => (
                  <tr key={i}>
                    <td className={`${styles.td} ${styles.tdName}`}>
                      {highlightText(m.name, query)}
                    </td>
                    <td className={`${styles.td} ${styles.tdValue}`}>
                      {m.value || <span style={{ color: "#aaa", fontStyle: "italic" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.noSettings}>
            Matched on policy name or description — no individual setting matches.
          </div>
        )
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Status = "idle" | "searching" | "done";

export default function PolicySettingsSearchPage() {
  const styles = useStyles();
  const [inputValue, setInputValue] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [results, setResults] = useState<PolicySearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    const q = inputValue.trim();
    if (!q || status === "searching") return;
    setStatus("searching");
    setProgress(0);
    setResults([]);
    setLastQuery(q);

    const found = await searchPolicySettings(q, (pct, ph) => {
      setProgress(pct);
      setPhase(ph);
    });

    setResults(found);
    setStatus("done");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleClear = () => {
    setInputValue("");
    setLastQuery("");
    setResults([]);
    setStatus("idle");
    inputRef.current?.focus();
  };

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);
  const typeCount = new Set(results.map((r) => r.policyType)).size;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Search"
        title="Settings Search"
        subtitle={'Search through all policy settings across your entire Intune tenant. Examples: "bitlocker", "vpn", "firewall", "password".'}
        icon={<DocumentSearchRegular />}
      />

      {/* Search bar */}
      <div className={styles.searchBar}>
        <Input
          ref={inputRef}
          style={{ flex: 1, maxWidth: 560 }}
          placeholder='Search a setting, e.g. "battery" or "bitlocker"…'
          value={inputValue}
          onChange={(_, d) => setInputValue(d.value)}
          onKeyDown={handleKeyDown}
          contentBefore={<SearchRegular />}
          contentAfter={
            inputValue ? (
              <Button
                size="small"
                appearance="transparent"
                icon={<DismissRegular />}
                onClick={handleClear}
                style={{ minWidth: 0, padding: "0 2px" }}
              />
            ) : undefined
          }
          disabled={status === "searching"}
          size="large"
        />
        <Button
          appearance="primary"
          size="large"
          icon={status === "searching" ? <Spinner size="extra-tiny" /> : <SearchRegular />}
          disabled={!inputValue.trim() || status === "searching"}
          onClick={handleSearch}
        >
          {status === "searching" ? `${progress}%` : "Search"}
        </Button>
      </div>

      {/* Stats */}
      {status === "done" && (
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <Text className={styles.statVal}>{results.length}</Text>
            <Text className={styles.statLabel}>Policies matched</Text>
          </div>
          <div className={styles.stat}>
            <Text className={styles.statVal}>{totalMatches}</Text>
            <Text className={styles.statLabel}>Setting matches</Text>
          </div>
          <div className={styles.stat}>
            <Text className={styles.statVal}>{typeCount}</Text>
            <Text className={styles.statLabel}>Policy types</Text>
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginLeft: "auto" }}>
            Results for "{lastQuery}"
          </Text>
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>
        {status === "idle" && (
          <div className={styles.empty}>
            <DocumentSearchRegular style={{ fontSize: 52 }} />
            <Text size={500} weight="semibold">Search all Intune policy settings</Text>
            <Text size={300} style={{ maxWidth: 480 }}>
              Enter a keyword above to find all policies that contain a matching setting.
              Searches Settings Catalog, Device Configurations, Compliance, Admin Templates, and more.
            </Text>
          </div>
        )}

        {status === "searching" && (
          <div className={styles.progressWrap}>
            <Spinner size="large" />
            <Text size={400} weight="semibold">{phase}</Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              {progress}% — searching for "{lastQuery}"
            </Text>
          </div>
        )}

        {status === "done" && results.length === 0 && (
          <div className={styles.empty}>
            <Text size={500} weight="semibold">No results found</Text>
            <Text size={300}>
              No policies or settings matched "{lastQuery}". Try a different search term.
            </Text>
          </div>
        )}

        {status === "done" && results.length > 0 && (
          <div className={styles.resultsList}>
            {results.map((result) => (
              <ResultCard key={result.policyId} result={result} query={lastQuery} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
