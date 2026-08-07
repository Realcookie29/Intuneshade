import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ChevronRight16Regular,
  ClipboardRegular,
  CheckmarkRegular,
  DismissRegular,
  SearchRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import PageHeader from "../layout/PageHeader";
import { ACCENTS, FONTS } from "../../theme/theme";
import { getPolicyDefinition } from "../../utils/policyConfig";
import {
  MEMBEROF_RETIREMENT_DATE,
  attachIntuneImpact,
  buildMemberOfCsv,
  daysUntilRetirement,
  isAssignmentsCached,
  remediationLabel,
  scanMemberOfUsage,
  type ImpactedPolicy,
  type MemberOfFinding,
  type Severity,
} from "../../services/memberOfScanService";

// ─── Styles ─────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },

  deadline: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 28px",
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid ${ACCENTS.amber}`,
  },
  deadlineIcon: { color: ACCENTS.amber, fontSize: "20px", flexShrink: 0 },
  deadlineText: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2 },
  countdown: { fontFamily: FONTS.mono, fontWeight: tokens.fontWeightSemibold, color: ACCENTS.amber },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    padding: "14px 28px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  search: { minWidth: "220px" },
  spacer: { marginLeft: "auto" },

  stats: {
    display: "flex",
    gap: "28px",
    padding: "12px 28px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: "wrap",
  },
  stat: { display: "flex", flexDirection: "column", gap: "2px" },
  statVal: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  statLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },

  content: { flex: 1, overflow: "auto", padding: "16px 28px 32px" },

  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    marginBottom: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    cursor: "pointer",
    width: "100%",
    border: "none",
    background: "transparent",
    textAlign: "left",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  chevron: { transition: "transform 0.15s ease", flexShrink: 0, color: tokens.colorNeutralForeground3 },
  chevronOpen: { transform: "rotate(90deg)" },
  sevDot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  headName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  headMeta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  headRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 },

  body: {
    padding: "4px 16px 18px 40px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  section: { display: "flex", flexDirection: "column", gap: "6px" },
  sectionTitle: {
    fontSize: tokens.fontSizeBase100,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  rule: {
    fontFamily: FONTS.mono,
    fontSize: tokens.fontSizeBase200,
    lineHeight: "1.6",
    padding: "10px 12px",
    borderRadius: "6px",
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  ruleOk: { borderLeft: `3px solid ${ACCENTS.mint}` },
  highlight: {
    backgroundColor: "rgba(255, 176, 32, 0.22)",
    borderRadius: "3px",
    padding: "1px 2px",
    fontWeight: tokens.fontWeightSemibold,
  },
  refRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 0",
    fontSize: tokens.fontSizeBase200,
    flexWrap: "wrap",
  },
  refRule: {
    fontFamily: FONTS.mono,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    wordBreak: "break-word",
  },
  note: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    paddingLeft: "16px",
    position: "relative",
    lineHeight: "1.5",
    "::before": { content: '"—"', position: "absolute", left: 0, color: tokens.colorNeutralForeground4 },
  },
  policyChips: { display: "flex", flexWrap: "wrap", gap: "6px" },
  policyChip: {
    fontSize: tokens.fontSizeBase100,
    padding: "3px 8px",
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  policyChipExclude: { border: `1px solid ${ACCENTS.danger}`, color: ACCENTS.danger },

  centre: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    padding: "72px 24px",
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  clean: { color: ACCENTS.mint, fontSize: "40px" },
  error: {
    padding: "10px 14px",
    borderRadius: "6px",
    border: `1px solid ${ACCENTS.danger}`,
    color: ACCENTS.danger,
    fontSize: tokens.fontSizeBase200,
    marginBottom: "12px",
  },
});

const SEVERITY_COLOR: Record<Severity, string> = {
  high: ACCENTS.danger,
  medium: ACCENTS.amber,
  low: tokens.colorNeutralForeground4,
};

type FilterKey = "all" | "groups" | "aus" | "impact" | "fixable";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "groups", label: "Groups" },
  { key: "aus", label: "Admin units" },
  { key: "impact", label: "Affects Intune" },
  { key: "fixable", label: "Auto-rewritable" },
];

// ─── Rule renderer ──────────────────────────────────────────────────────────

/** Renders the rule with each memberOf clause highlighted. */
function RuleText({ finding, className }: { finding: MemberOfFinding; className: string }) {
  const styles = useStyles();
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const [i, clause] of [...finding.clauses].sort((a, b) => a.start - b.start).entries()) {
    if (clause.start > cursor) parts.push(finding.membershipRule.slice(cursor, clause.start));
    parts.push(
      <span key={i} className={styles.highlight}>
        {finding.membershipRule.slice(clause.start, clause.end)}
      </span>
    );
    cursor = clause.end;
  }
  parts.push(finding.membershipRule.slice(cursor));

  return <div className={className}>{parts}</div>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="small"
      appearance="subtle"
      icon={copied ? <CheckmarkRegular /> : <ClipboardRegular />}
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          },
          () => undefined
        );
      }}
    >
      {copied ? "Copied" : "Copy rule"}
    </Button>
  );
}

// ─── Finding card ───────────────────────────────────────────────────────────

function FindingCard({ finding }: { finding: MemberOfFinding }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  // A group can be targeted by the same policy more than once (include on one
  // assignment, a filter variant on another) — count each policy once.
  const distinctPolicies = useMemo(() => {
    const seen = new Map<string, ImpactedPolicy>();
    for (const p of finding.policies ?? []) if (!seen.has(p.policyId)) seen.set(p.policyId, p);
    return [...seen.values()];
  }, [finding]);

  return (
    <div className={styles.card}>
      <button className={styles.cardHead} onClick={() => setOpen(!open)}>
        <ChevronRight16Regular className={mergeClasses(styles.chevron, open && styles.chevronOpen)} />
        <span className={styles.sevDot} style={{ backgroundColor: SEVERITY_COLOR[finding.severity] }} />
        <span style={{ minWidth: 0 }}>
          <Text className={styles.headName} block>
            {finding.displayName}
          </Text>
          <Text className={styles.headMeta}>
            {finding.kind === "group" ? "Dynamic group" : "Administrative unit"}
            {" · "}
            {finding.referenced.length} referenced{" "}
            {finding.referenced.length === 1 ? "group" : "groups"}
          </Text>
        </span>

        <span className={styles.headRight}>
          {finding.processingState.toLowerCase() === "paused" && (
            <Badge appearance="outline" color="informative">
              Paused
            </Badge>
          )}
          {finding.policies === null ? (
            <Badge appearance="outline" color="subtle">
              Impact not analysed
            </Badge>
          ) : distinctPolicies.length > 0 ? (
            <Badge appearance="filled" color="danger">
              {distinctPolicies.length} {distinctPolicies.length === 1 ? "policy" : "policies"}
            </Badge>
          ) : finding.kind === "group" ? (
            <Badge appearance="outline" color="success">
              No Intune assignments
            </Badge>
          ) : null}
          <Badge appearance="tint" color={finding.suggestedRule ? "success" : "warning"}>
            {remediationLabel(finding.remediation)}
          </Badge>
        </span>
      </button>

      {open && (
        <div className={styles.body}>
          {finding.description && (
            <Text style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
              {finding.description}
            </Text>
          )}

          <div className={styles.section}>
            <Text className={styles.sectionTitle}>Current membership rule</Text>
            <RuleText finding={finding} className={styles.rule} />
          </div>

          <div className={styles.section}>
            <Text className={styles.sectionTitle}>Referenced groups</Text>
            {finding.referenced.map((r) => (
              <div key={r.id} className={styles.refRow}>
                {!r.exists ? (
                  <Badge appearance="filled" color="danger">
                    Missing
                  </Badge>
                ) : r.usesMemberOf ? (
                  <Badge appearance="filled" color="warning">
                    Also uses memberOf
                  </Badge>
                ) : r.isDynamic ? (
                  <Badge appearance="outline" color="brand">
                    Dynamic
                  </Badge>
                ) : (
                  <Badge appearance="outline" color="subtle">
                    Assigned
                  </Badge>
                )}
                <Text weight="semibold" size={200}>
                  {r.displayName}
                </Text>
                {r.membershipRule && <Text className={styles.refRule}>{r.membershipRule}</Text>}
              </div>
            ))}
          </div>

          {finding.suggestedRule && (
            <div className={styles.section}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Text className={styles.sectionTitle}>Suggested replacement rule</Text>
                <CopyButton value={finding.suggestedRule} />
              </div>
              <div className={mergeClasses(styles.rule, styles.ruleOk)}>{finding.suggestedRule}</div>
            </div>
          )}

          {finding.notes.length > 0 && (
            <div className={styles.section}>
              <Text className={styles.sectionTitle}>What to do</Text>
              {finding.notes.map((n, i) => (
                <Text key={i} className={styles.note}>
                  {n}
                </Text>
              ))}
              {finding.kind === "administrativeUnit" && (
                <Text className={styles.note}>
                  This is an administrative unit: when the rule stops evaluating, the unit stops gaining
                  members, so scoped admin role assignments silently narrow. Check which roles are scoped
                  to it before changing anything.
                </Text>
              )}
            </div>
          )}

          {distinctPolicies.length > 0 && (
            <div className={styles.section}>
              <Text className={styles.sectionTitle}>
                Intune policies targeting this group ({distinctPolicies.length})
              </Text>
              <div className={styles.policyChips}>
                {distinctPolicies.map((p) => (
                  <span
                    key={p.policyId}
                    className={mergeClasses(
                      styles.policyChip,
                      p.mode === "exclude" && styles.policyChipExclude
                    )}
                    title={`${getPolicyDefinition(p.policyType).label} · ${p.mode}`}
                  >
                    {p.policyName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

type Status = "idle" | "scanning" | "done";

export default function MemberOfMigrationPage() {
  const styles = useStyles();

  const [status, setStatus] = useState<Status>("idle");
  const [phase, setPhase] = useState("");
  const [findings, setFindings] = useState<MemberOfFinding[]>([]);
  const [scanned, setScanned] = useState({ groups: 0, aus: 0 });
  const [auError, setAuError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [impactRunning, setImpactRunning] = useState(false);
  const [impactDone, setImpactDone] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const days = daysUntilRetirement();

  const runImpact = async (list: MemberOfFinding[]) => {
    setImpactRunning(true);
    try {
      const enriched = await attachIntuneImpact(list, (done, total, label) =>
        setPhase(label ? `Scanning assignments — ${label} (${done}/${total})` : "")
      );
      setFindings(enriched);
      setImpactDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImpactRunning(false);
      setPhase("");
    }
  };

  const runScan = async () => {
    setStatus("scanning");
    setError(null);
    setImpactDone(false);
    try {
      const result = await scanMemberOfUsage(setPhase);
      setFindings(result.findings);
      setScanned({ groups: result.dynamicGroupCount, aus: result.dynamicAuCount });
      setAuError(result.auError);
      setStatus("done");
      // The tenant assignment scan is usually already warm from login — use it
      // straight away, and otherwise leave it to the user to ask for it.
      if (result.findings.length > 0 && isAssignmentsCached()) await runImpact(result.findings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    } finally {
      setPhase("");
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings.filter((f) => {
      if (filter === "groups" && f.kind !== "group") return false;
      if (filter === "aus" && f.kind !== "administrativeUnit") return false;
      if (filter === "impact" && !(f.policies && f.policies.length > 0)) return false;
      if (filter === "fixable" && !f.suggestedRule) return false;
      if (!q) return true;
      return (
        f.displayName.toLowerCase().includes(q) ||
        f.membershipRule.toLowerCase().includes(q) ||
        f.referenced.some((r) => r.displayName.toLowerCase().includes(q))
      );
    });
  }, [findings, filter, query]);

  const stats = useMemo(() => {
    const groups = findings.filter((f) => f.kind === "group").length;
    const aus = findings.filter((f) => f.kind === "administrativeUnit").length;
    const policies = new Set(
      findings.flatMap((f) => (f.policies ?? []).map((p) => p.policyId))
    ).size;
    const fixable = findings.filter((f) => f.suggestedRule).length;
    return { groups, aus, policies, fixable };
  }, [findings]);

  const exportCsv = () => {
    const blob = new Blob([buildMemberOfCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memberof-migration-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const busy = status === "scanning" || impactRunning;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Governance · temporary"
        title="memberOf Migration"
        subtitle="Find every dynamic group and administrative unit whose membership rule still uses memberOf, and see exactly what breaks in Intune when the operator is retired."
        icon={<WarningRegular />}
        actions={
          <>
            {status === "done" && findings.length > 0 && (
              <Button appearance="subtle" icon={<ArrowDownloadRegular />} onClick={exportCsv}>
                Export CSV
              </Button>
            )}
            <Button
              appearance="primary"
              icon={busy ? <Spinner size="extra-tiny" /> : undefined}
              disabled={busy}
              onClick={runScan}
            >
              {status === "done" ? "Rescan" : "Scan tenant"}
            </Button>
          </>
        }
      />

      <div className={styles.deadline}>
        <WarningRegular className={styles.deadlineIcon} />
        <Text className={styles.deadlineText}>
          Entra ID retires the <strong>memberOf</strong> operator in dynamic membership rules from{" "}
          <strong>November 2026</strong>. Rules that still use it stop evaluating, so the group or unit
          keeps its current members and never updates again —{" "}
          <span className={styles.countdown}>
            {days > 0 ? `${days} days left` : "the date has passed"}
          </span>{" "}
          (counting to {MEMBEROF_RETIREMENT_DATE}).
        </Text>
      </div>

      {status === "done" && (
        <>
          <div className={styles.toolbar}>
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="small"
                appearance={filter === f.key ? "primary" : "subtle"}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
            <Input
              className={styles.search}
              size="small"
              placeholder="Filter by name, rule or source group…"
              value={query}
              onChange={(_, d) => setQuery(d.value)}
              contentBefore={<SearchRegular />}
              contentAfter={
                query ? (
                  <DismissRegular style={{ cursor: "pointer" }} onClick={() => setQuery("")} />
                ) : undefined
              }
            />
            {findings.length > 0 && !impactDone && (
              <Tooltip
                content="Scans every Intune policy to find which ones target these groups. Takes a moment on a large tenant."
                relationship="description"
              >
                <Button
                  className={styles.spacer}
                  size="small"
                  appearance="outline"
                  disabled={impactRunning}
                  icon={impactRunning ? <Spinner size="extra-tiny" /> : undefined}
                  onClick={() => runImpact(findings)}
                >
                  Analyse Intune impact
                </Button>
              </Tooltip>
            )}
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <Text className={styles.statVal} style={{ color: findings.length ? ACCENTS.amber : undefined }}>
                {stats.groups}
              </Text>
              <Text className={styles.statLabel}>Groups affected</Text>
            </div>
            <div className={styles.stat}>
              <Text className={styles.statVal} style={{ color: stats.aus ? ACCENTS.amber : undefined }}>
                {stats.aus}
              </Text>
              <Text className={styles.statLabel}>Admin units affected</Text>
            </div>
            <div className={styles.stat}>
              <Text className={styles.statVal}>
                {impactDone ? stats.policies : "—"}
              </Text>
              <Text className={styles.statLabel}>Intune policies at risk</Text>
            </div>
            <div className={styles.stat}>
              <Text className={styles.statVal} style={{ color: stats.fixable ? ACCENTS.mint : undefined }}>
                {stats.fixable}
              </Text>
              <Text className={styles.statLabel}>Auto-rewritable</Text>
            </div>
            <div className={styles.stat}>
              <Text className={styles.statVal}>
                {scanned.groups}
                <span style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
                  {" / "}
                  {scanned.aus}
                </span>
              </Text>
              <Text className={styles.statLabel}>Dynamic groups / units scanned</Text>
            </div>
          </div>
        </>
      )}

      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}
        {auError && status === "done" && (
          <div className={styles.error}>
            Administrative units could not be read, so only groups were checked. This usually means the
            signed-in account lacks directory read rights for administrative units. ({auError})
          </div>
        )}

        {status === "idle" && !error && (
          <div className={styles.centre}>
            <WarningRegular style={{ fontSize: 44, color: ACCENTS.amber }} />
            <Text size={500} weight="semibold">
              Scan the tenant for memberOf rules
            </Text>
            <Text size={300} style={{ maxWidth: 560 }}>
              Reads every dynamic group and administrative unit, flags the ones whose rule uses memberOf,
              resolves the groups those rules point at, and proposes a replacement rule where it can be
              derived safely. Read-only — nothing is changed in the tenant.
            </Text>
          </div>
        )}

        {status === "scanning" && (
          <div className={styles.centre}>
            <Spinner size="large" />
            <Text size={400} weight="semibold">
              {phase || "Scanning…"}
            </Text>
          </div>
        )}

        {status === "done" && findings.length === 0 && (
          <div className={styles.centre}>
            <CheckmarkRegular className={styles.clean} />
            <Text size={500} weight="semibold">
              No memberOf rules found
            </Text>
            <Text size={300}>
              Checked {scanned.groups} dynamic {scanned.groups === 1 ? "group" : "groups"} and{" "}
              {scanned.aus} dynamic administrative {scanned.aus === 1 ? "unit" : "units"}. This tenant is
              ready for the retirement.
            </Text>
          </div>
        )}

        {status === "done" && findings.length > 0 && (
          <>
            {impactRunning && phase && (
              <Text
                size={200}
                style={{ display: "block", marginBottom: 10, color: tokens.colorNeutralForeground3 }}
              >
                {phase}
              </Text>
            )}
            {visible.length === 0 ? (
              <div className={styles.centre}>
                <Text size={400}>No findings match this filter.</Text>
              </div>
            ) : (
              visible.map((f) => <FindingCard key={`${f.kind}-${f.id}`} finding={f} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
