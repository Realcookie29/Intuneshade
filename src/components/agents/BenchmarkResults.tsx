import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Tab,
  TabList,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, ChevronRight16Regular } from "@fluentui/react-icons";
import { ACCENTS, FONTS } from "../../theme/theme";
import { NIS2_MANUAL_CHECKS, NIS2_MEASURES, controlById } from "../../baseline";
import type { Advice, BenchmarkReport, Finding, FindingStatus, Nis2Measure } from "../../baseline/types";
import { renderReportHtml } from "../../services/agents/reporter";

const STATUS_COLOR: Record<FindingStatus, string> = {
  pass: ACCENTS.mint,
  fail: ACCENTS.danger,
  manual: ACCENTS.amber,
  not_applicable: tokens.colorNeutralForeground3,
  error: tokens.colorNeutralForeground3,
};

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 },
  kpis: { display: "flex", gap: "12px", flexWrap: "wrap" },
  kpi: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    padding: "10px 14px",
    minWidth: "110px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  kpiValue: { fontFamily: FONTS.display, fontSize: "26px", fontWeight: 600, display: "block" },
  kpiLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  summary: {
    borderLeft: `3px solid ${ACCENTS.amber}`,
    padding: "8px 14px",
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: tokens.fontSizeBase300,
  },
  list: { display: "flex", flexDirection: "column", gap: "6px" },
  item: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  itemHead: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    width: "100%",
    border: "none",
    background: "none",
    color: "inherit",
    textAlign: "left",
    font: "inherit",
  },
  chevron: { transition: "transform 120ms", flexShrink: 0 },
  chevronOpen: { transform: "rotate(90deg)" },
  id: { fontFamily: FONTS.mono, fontSize: "12px", color: tokens.colorNeutralForeground3, width: "84px", flexShrink: 0 },
  title: { flex: 1, minWidth: 0 },
  sub: { display: "block", fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  dot: { width: "9px", height: "9px", borderRadius: "50%", flexShrink: 0 },
  body: {
    padding: "4px 14px 12px 40px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontSize: tokens.fontSizeBase300,
  },
  facts: { fontFamily: FONTS.mono, fontSize: "12px", color: tokens.colorNeutralForeground2, margin: 0, paddingLeft: "16px" },
  pre: {
    fontFamily: FONTS.mono,
    fontSize: "12px",
    backgroundColor: tokens.colorNeutralBackground3,
    padding: "10px",
    borderRadius: "6px",
    overflowX: "auto",
    margin: 0,
  },
  refs: { display: "flex", gap: "4px", flexWrap: "wrap" },
  nisRow: {
    display: "grid",
    gridTemplateColumns: "40px 1fr 90px",
    gap: "8px",
    padding: "8px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    alignItems: "start",
  },
  bar: { height: "6px", borderRadius: "3px", backgroundColor: tokens.colorNeutralBackground4, overflow: "hidden", marginTop: "6px" },
  barFill: { height: "100%", backgroundColor: ACCENTS.mint },
  disclaimer: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
});

type Filter = "attention" | "all" | "pass";

interface Props {
  report: BenchmarkReport;
  findings: Finding[];
  advice: Advice[];
}

export default function BenchmarkResults({ report, findings, advice }: Props) {
  const styles = useStyles();
  const [tab, setTab] = useState<"controls" | "nis2">("controls");
  const [filter, setFilter] = useState<Filter>("attention");
  const [open, setOpen] = useState<string | null>(null);
  const adviceById = useMemo(() => new Map(advice.map((a) => [a.controlId, a])), [advice]);

  const visible = useMemo(() => {
    const rank = (f: Finding) => adviceById.get(f.controlId)?.priority ?? (f.status === "pass" ? 9 : 6);
    return findings
      .filter((f) =>
        filter === "all" ? true : filter === "pass" ? f.status === "pass" : f.status !== "pass" && f.status !== "not_applicable")
      .sort((a, b) => rank(a) - rank(b));
  }, [findings, filter, adviceById]);

  function exportHtml() {
    const html = renderReportHtml(report, findings, advice);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intuneshade-baseline-${report.profile}-${report.generatedAt.slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.root}>
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiValue} style={{ color: report.overall.score >= 80 ? ACCENTS.mint : report.overall.score >= 50 ? ACCENTS.amber : ACCENTS.danger }}>
            {report.overall.score}%
          </span>
          <span className={styles.kpiLabel}>Baseline {report.profile}</span>
        </div>
        <div className={styles.kpi}><span className={styles.kpiValue}>{report.overall.passed}</span><span className={styles.kpiLabel}>passed</span></div>
        <div className={styles.kpi}><span className={styles.kpiValue}>{report.overall.failed}</span><span className={styles.kpiLabel}>failed</span></div>
        <div className={styles.kpi}><span className={styles.kpiValue}>{report.overall.manual + report.overall.errors}</span><span className={styles.kpiLabel}>verify manually</span></div>
        <div style={{ flex: 1 }} />
        <Button icon={<ArrowDownloadRegular />} onClick={exportHtml}>Export report</Button>
      </div>

      <div className={styles.summary}>
        <Text>{report.executiveSummary}</Text>
        <Text className={styles.sub}>{report.summarySource === "ai" ? "AI-generated summary. Verify before sharing." : "Rule-based summary"}</Text>
      </div>

      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as typeof tab)} size="small">
        <Tab value="controls">Controls</Tab>
        <Tab value="nis2">NIS2 readiness</Tab>
      </TabList>

      {tab === "controls" && (
        <>
          <TabList selectedValue={filter} onTabSelect={(_, d) => setFilter(d.value as Filter)} size="small" appearance="subtle">
            <Tab value="attention">Needs attention</Tab>
            <Tab value="pass">Passed</Tab>
            <Tab value="all">All</Tab>
          </TabList>
          <div className={styles.list}>
            {visible.map((f) => {
              const c = controlById(f.controlId);
              const a = adviceById.get(f.controlId);
              const isOpen = open === f.controlId;
              return (
                <div key={f.controlId} className={styles.item}>
                  <button className={styles.itemHead} onClick={() => setOpen(isOpen ? null : f.controlId)} aria-expanded={isOpen}>
                    <ChevronRight16Regular className={mergeClasses(styles.chevron, isOpen && styles.chevronOpen)} />
                    <span className={styles.dot} style={{ backgroundColor: STATUS_COLOR[f.status] }} />
                    <span className={styles.id}>{f.controlId}</span>
                    <span className={styles.title}>
                      {c?.title}
                      <span className={styles.sub}>{f.summary}</span>
                    </span>
                    {a && <Badge appearance="tint" color={a.priority <= 2 ? "danger" : "warning"}>P{a.priority}</Badge>}
                    <Badge appearance="outline">{c?.profile}</Badge>
                  </button>
                  {isOpen && c && (
                    <div className={styles.body}>
                      <Text>{c.rationale}</Text>
                      <div className={styles.refs}>
                        {c.refs.cis.map((r) => <Badge key={r} appearance="tint" color="informative">CIS {r}</Badge>)}
                        {c.refs.nis2.map((m) => <Badge key={m} appearance="tint" color="brand">NIS2 21(2)({m})</Badge>)}
                      </div>
                      <Text weight="semibold">Evidence {f.evidence.endpoint && <span className={styles.sub}>{f.evidence.endpoint}</span>}</Text>
                      {f.evidence.facts.length > 0 && (
                        <ul className={styles.facts}>{f.evidence.facts.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      )}
                      {a && (
                        <>
                          <Text weight="semibold">
                            Advice · effort {a.effort} <span className={styles.sub}>{a.source === "ai" ? "AI-generated. Review before applying." : "Built-in guidance"}</span>
                          </Text>
                          {a.source === "ai" && <Text>{a.explanation}</Text>}
                          <ol style={{ margin: 0, paddingLeft: "18px" }}>{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                          {a.script && (
                            <>
                              <Text className={styles.sub}>Suggested script. IntuneShade never runs it. Read it, test it, then run it yourself.</Text>
                              <pre className={styles.pre}>{a.script}</pre>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!visible.length && <Text className={styles.disclaimer}>Nothing here.</Text>}
          </div>
        </>
      )}

      {tab === "nis2" && (
        <div>
          {(Object.keys(NIS2_MEASURES) as Nis2Measure[]).map((m) => {
            const s = report.byNis2[m];
            const total = s.passed + s.failed;
            const manual = NIS2_MANUAL_CHECKS.filter((x) => x.measure === m);
            return (
              <div key={m} className={styles.nisRow}>
                <span className={styles.id}>({m})</span>
                <div>
                  <Text>{NIS2_MEASURES[m]}</Text>
                  {manual.map((x) => <span key={x.text} className={styles.sub}>☐ {x.text}</span>)}
                  {total > 0 && <div className={styles.bar}><div className={styles.barFill} style={{ width: `${s.score}%` }} /></div>}
                </div>
                <Text className={styles.sub}>{total ? `${s.score}% (${s.passed}/${total})` : "organisational"}</Text>
              </div>
            );
          })}
          <Text className={styles.disclaimer} block style={{ marginTop: "12px" }}>
            A technical readiness check, not a compliance statement. NIS2 / the Cyberbeveiligingswet also requires organisational measures that no tenant scan can verify.
          </Text>
        </div>
      )}

      <Text className={styles.disclaimer}>
        CIS references are indicative and point to the CIS Benchmarks® from the Center for Internet Security. Verify them against the benchmark version you use.
      </Text>
    </div>
  );
}
