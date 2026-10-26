import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Dropdown,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Radio,
  RadioGroup,
  Tab,
  TabList,
  Text,
  Textarea,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, ChevronRight16Regular, SearchRegular } from "@fluentui/react-icons";
import { ACCENTS, FONTS } from "../../theme/theme";
import { NIS2_MANUAL_CHECKS, NIS2_MEASURES, checkById, effectiveState } from "../../baseline";
import type { Advice, BenchmarkReport, CheckResult, CheckState, ManualAnswer, Nis2Measure, Severity, StateCounts } from "../../baseline/types";
import { useBenchmarkPrefs } from "../../store/benchmarkPrefsStore";
import {
  AREAS, STATE_COLOR, STATE_LABEL, coverageLabel, renderReportHtml, resultsCsv, resultsJson, scoreResults, toCsv,
} from "../../services/agents/reporter";

const STATES: CheckState[] = ["Pass", "Partial", "Fail", "Manual", "NotApplicable", "Error"];
const SEVERITIES: Severity[] = ["High", "Medium", "Low"];
const SEVERITY_RANK: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };
const STATE_RANK: Record<CheckState, number> = { Fail: 0, Error: 1, Partial: 2, Manual: 3, Pass: 4, NotApplicable: 5 };

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 },
  kpis: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "stretch" },
  kpi: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    padding: "8px 12px",
    minWidth: "84px",
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
  },
  kpiActive: { outline: `2px solid ${ACCENTS.amber}`, outlineOffset: "-1px" },
  kpiValue: { fontFamily: FONTS.display, fontSize: "24px", fontWeight: 600, display: "block" },
  kpiLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  summary: {
    borderLeft: `3px solid ${ACCENTS.amber}`,
    padding: "8px 14px",
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: tokens.fontSizeBase300,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  banner: {
    border: `1px solid ${ACCENTS.amber}`,
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: tokens.fontSizeBase200,
  },
  filters: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  dropdown: { minWidth: "150px" },
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
  id: { fontFamily: FONTS.mono, fontSize: "12px", color: tokens.colorNeutralForeground3, width: "64px", flexShrink: 0 },
  title: { flex: 1, minWidth: 0 },
  sub: { display: "block", fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  pill: { color: "#fff", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" },
  body: {
    padding: "4px 14px 14px 40px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    fontSize: tokens.fontSizeBase300,
  },
  grid: { display: "grid", gridTemplateColumns: "90px 1fr", gap: "4px 12px", fontSize: tokens.fontSizeBase300 },
  label: { color: tokens.colorNeutralForeground3 },
  tableWrap: { overflowX: "auto", border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: "6px" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "12px",
    "& td, & th": { padding: "4px 8px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: "left", verticalAlign: "top" },
    "& th": { color: tokens.colorNeutralForeground3, fontWeight: 600 },
  },
  mono: { fontFamily: FONTS.mono, wordBreak: "break-all" },
  pre: {
    fontFamily: FONTS.mono,
    fontSize: "12px",
    backgroundColor: tokens.colorNeutralBackground3,
    padding: "10px",
    borderRadius: "6px",
    overflowX: "auto",
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  manual: {
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: "8px",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  scoreRow: {
    display: "grid",
    gridTemplateColumns: "minmax(140px, 1fr) 2fr 70px",
    gap: "10px",
    padding: "8px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    alignItems: "center",
  },
  bar: { height: "8px", borderRadius: "4px", backgroundColor: tokens.colorNeutralBackground4, overflow: "hidden", display: "flex" },
  disclaimer: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
});

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function fmt(v: unknown): string {
  if (v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

function StackedBar({ s }: { s: StateCounts }) {
  const styles = useStyles();
  const total = s.Pass + s.Partial + s.Fail;
  if (!total) return <div className={styles.bar} />;
  return (
    <div className={styles.bar}>
      {(["Pass", "Partial", "Fail"] as const).map((k) => (
        <div key={k} style={{ width: `${(s[k] / total) * 100}%`, backgroundColor: STATE_COLOR[k] }} />
      ))}
    </div>
  );
}

function ManualAnswerBox({ id, answer }: { id: string; answer?: ManualAnswer }) {
  const styles = useStyles();
  const setManualAnswer = useBenchmarkPrefs((s) => s.setManualAnswer);
  const [notes, setNotes] = useState(answer?.notes ?? "");
  const save = (value: ManualAnswer["answer"] | "", n = notes) =>
    setManualAnswer(id, value ? { answer: value, notes: n.slice(0, 2000), updated: new Date().toISOString() } : null);
  return (
    <div className={styles.manual}>
      <Text weight="semibold">Your answer</Text>
      <RadioGroup layout="horizontal" value={answer?.answer ?? ""} onChange={(_, d) => save(d.value as ManualAnswer["answer"] | "")}>
        <Radio value="Pass" label="Pass" />
        <Radio value="Fail" label="Fail" />
        <Radio value="NotApplicable" label="Not applicable" />
        <Radio value="" label="Not answered" />
      </RadioGroup>
      <Textarea
        placeholder="Notes (e.g. where you verified it)"
        value={notes}
        onChange={(_, d) => setNotes(d.value)}
        onBlur={() => answer && save(answer.answer)}
        resize="vertical"
      />
      <Text className={styles.sub}>Stored in this browser only. Answers count towards the score{answer ? ` · updated ${new Date(answer.updated).toLocaleString()}` : ""}.</Text>
    </div>
  );
}

function CheckDetail({ r, advice, answer }: { r: CheckResult; advice?: Advice; answer?: ManualAnswer }) {
  const styles = useStyles();
  const c = checkById(r.id);
  return (
    <div className={styles.body}>
      <div className={styles.grid}>
        <span className={styles.label}>CIS ID</span><span className={styles.mono}>{r.id} · {c?.area} · {c?.checkType}</span>
        <span className={styles.label}>Rule</span><span>{c?.rule}</span>
        <span className={styles.label}>Expected</span><span>{r.expected}</span>
        <span className={styles.label}>Actual</span><span>{r.actual}</span>
        {c?.notes && <><span className={styles.label}>Notes</span><span>{c.notes}</span></>}
      </div>
      {r.evidence.length > 0 && (
        <>
          <Text weight="semibold">Evidence</Text>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Source</th><th>Path</th><th>Value</th></tr></thead>
              <tbody>
                {r.evidence.map((e, i) => (
                  <tr key={i}><td className={styles.mono}>{e.source}</td><td className={styles.mono}>{e.path}</td><td className={styles.mono}>{fmt(e.value)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {r.table && r.table.rows.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Text weight="semibold">{r.table.name} ({r.table.rows.length})</Text>
            <Button size="small" icon={<ArrowDownloadRegular />}
              onClick={() => download(`cis-${r.id}-${r.table!.name.toLowerCase().replace(/\W+/g, "-")}.csv`, toCsv(r.table!.columns, r.table!.rows), "text/csv")}>
              CSV
            </Button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{r.table.columns.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {r.table.rows.slice(0, 25).map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {r.table.rows.length > 25 && <Text className={styles.sub}>Showing 25 of {r.table.rows.length} — export the CSV for all rows.</Text>}
        </>
      )}
      {r.state === "Manual" && <ManualAnswerBox key={answer?.updated ?? "none"} id={r.id} answer={answer} />}
      {advice && (
        <>
          <Text weight="semibold">
            Advice · priority {advice.priority} · effort {advice.effort}{" "}
            <span className={styles.sub}>{advice.source === "ai" ? "AI-generated. Review before applying." : "Built-in guidance"}</span>
          </Text>
          {advice.source === "ai" && <Text>{advice.explanation}</Text>}
          <ol style={{ margin: 0, paddingLeft: "18px" }}>{advice.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {advice.script && (
            <>
              <Text className={styles.sub}>Suggested script. IntuneShade never runs it. Read it, test it, then run it yourself.</Text>
              <pre className={styles.pre}>{advice.script}</pre>
            </>
          )}
        </>
      )}
    </div>
  );
}

type StateFilter = "attention" | "all" | CheckState;

interface Props {
  report: BenchmarkReport;
  results: CheckResult[];
  advice: Advice[];
  coManaged: boolean | null;
}

export default function BenchmarkResults({ report, results, advice, coManaged }: Props) {
  const styles = useStyles();
  const answers = useBenchmarkPrefs((s) => s.manualAnswers);
  const [tab, setTab] = useState<"checks" | "areas" | "nis2">("checks");
  const [stateFilter, setStateFilter] = useState<StateFilter>("attention");
  const [area, setArea] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const adviceById = useMemo(() => new Map(advice.map((a) => [a.id, a])), [advice]);
  // Scores follow manual answers live; the Reporter's summary text stays as written.
  const scores = useMemo(() => scoreResults(results, answers), [results, answers]);
  const liveReport: BenchmarkReport = { ...report, ...scores };
  const o = scores.overall;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results
      .map((r) => ({ r, s: effectiveState(r, answers), c: checkById(r.id) }))
      .filter(({ s }) =>
        stateFilter === "all" ? true
          : stateFilter === "attention" ? s === "Fail" || s === "Partial" || s === "Manual" || s === "Error"
            : s === stateFilter)
      .filter(({ c }) => area === "all" || c?.area === area)
      .filter(({ c }) => severity === "all" || c?.severity === severity)
      .filter(({ r, c }) => !q || `${r.id} ${c?.title} ${r.message}`.toLowerCase().includes(q))
      .sort((a, b) =>
        STATE_RANK[a.s] - STATE_RANK[b.s]
        || SEVERITY_RANK[a.c?.severity ?? "Low"] - SEVERITY_RANK[b.c?.severity ?? "Low"]
        || a.r.id.localeCompare(b.r.id, undefined, { numeric: true }));
  }, [results, answers, stateFilter, area, severity, search]);

  const date = report.generatedAt.slice(0, 10);
  const kpi = (label: string, value: number | string, filter: StateFilter, color?: string) => (
    <button
      className={mergeClasses(styles.kpi, stateFilter === filter && tab === "checks" && styles.kpiActive)}
      onClick={() => { setTab("checks"); setStateFilter(stateFilter === filter ? "attention" : filter); }}
    >
      <span className={styles.kpiValue} style={{ color }}>{value}</span>
      <span className={styles.kpiLabel}>{label}</span>
    </button>
  );

  return (
    <div className={styles.root}>
      <div className={styles.kpis}>
        {kpi(`score · ${report.coverage.assessed}/${report.coverage.total} checks`, `${o.score}%`, "all", o.score >= 80 ? ACCENTS.mint : o.score >= 50 ? ACCENTS.amber : ACCENTS.danger)}
        {STATES.map((s) => kpi(STATE_LABEL[s], o[s], s, o[s] ? STATE_COLOR[s] : undefined))}
        <div style={{ flex: 1 }} />
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button icon={<ArrowDownloadRegular />}>Export</Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem onClick={() => download(`intuneshade-cis-l1-${date}.html`, renderReportHtml(liveReport, results, advice, answers), "text/html")}>HTML report</MenuItem>
              <MenuItem onClick={() => download(`intuneshade-cis-l1-${date}.csv`, resultsCsv(results, answers), "text/csv")}>CSV (all checks)</MenuItem>
              <MenuItem onClick={() => download(`intuneshade-cis-l1-${date}.json`, resultsJson(liveReport, results, advice, answers), "application/json")}>JSON (full results)</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
      <Text className={styles.disclaimer}>Score = Pass / (Pass + Partial + Fail) over {coverageLabel(report.coverage)}. Manual, N/A and Error are not scored; answering a manual check counts it.</Text>
      {report.coverage.assessed < report.coverage.total && (
        <div className={styles.banner}>
          Partial scan: {report.coverage.total - report.coverage.assessed} of {report.coverage.total} checks were not selected
          {report.coverage.areasNotAssessed.length ? ` (not assessed: ${report.coverage.areasNotAssessed.join(", ")})` : ""}.
          This score does not cover the whole CIS L1 benchmark.
        </div>
      )}

      <div className={styles.summary}>
        <Text>{report.executiveSummary}</Text>
        <Text className={styles.sub}>{report.summarySource === "ai" ? "AI-generated summary. Verify before sharing." : "Rule-based summary"} · written at the end of the run</Text>
      </div>

      {coManaged && (
        <div className={styles.banner}>
          Co-managed devices found. If ConfigMgr still owns the compliance or device-configuration workloads, some Intune
          results (4.x) may not reflect what devices actually get.
        </div>
      )}

      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as typeof tab)} size="small">
        <Tab value="checks">Checks</Tab>
        <Tab value="areas">By area</Tab>
        <Tab value="nis2">NIS2 readiness</Tab>
      </TabList>

      {tab === "checks" && (
        <>
          <div className={styles.filters}>
            <Dropdown className={styles.dropdown} size="small" aria-label="State"
              value={stateFilter === "attention" ? "Needs attention" : stateFilter === "all" ? "All states" : STATE_LABEL[stateFilter]}
              selectedOptions={[stateFilter]} onOptionSelect={(_, d) => setStateFilter(d.optionValue as StateFilter)}>
              <Option value="attention">Needs attention</Option>
              <Option value="all">All states</Option>
              {STATES.map((s) => <Option key={s} value={s}>{STATE_LABEL[s]}</Option>)}
            </Dropdown>
            <Dropdown className={styles.dropdown} size="small" aria-label="Area"
              value={area === "all" ? "All areas" : area} selectedOptions={[area]} onOptionSelect={(_, d) => setArea(d.optionValue ?? "all")}>
              <Option value="all">All areas</Option>
              {AREAS.map((a) => <Option key={a} value={a}>{a}</Option>)}
            </Dropdown>
            <Dropdown className={styles.dropdown} size="small" aria-label="Severity"
              value={severity === "all" ? "All severities" : severity} selectedOptions={[severity]} onOptionSelect={(_, d) => setSeverity(d.optionValue ?? "all")}>
              <Option value="all">All severities</Option>
              {SEVERITIES.map((s) => <Option key={s} value={s}>{s}</Option>)}
            </Dropdown>
            <Input size="small" contentBefore={<SearchRegular />} placeholder="Search ID, title, message" value={search} onChange={(_, d) => setSearch(d.value)} />
            <Text className={styles.sub}>{visible.length} of {results.length}</Text>
          </div>
          <div className={styles.list}>
            {visible.map(({ r, s, c }) => {
              const a = adviceById.get(r.id);
              const isOpen = open === r.id;
              const answered = r.state === "Manual" && answers[r.id];
              return (
                <div key={r.id} className={styles.item}>
                  <button className={styles.itemHead} onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                    <ChevronRight16Regular className={mergeClasses(styles.chevron, isOpen && styles.chevronOpen)} />
                    <span className={styles.id}>{r.id}</span>
                    <span className={styles.title}>
                      {c?.title ?? r.id}
                      <span className={styles.sub}>{r.message}</span>
                    </span>
                    {a && (s === "Fail" || s === "Partial") && <Badge appearance="tint" color={a.priority <= 2 ? "danger" : "warning"}>P{a.priority}</Badge>}
                    <Badge appearance="outline">{c?.severity}</Badge>
                    <span className={styles.pill} style={{ backgroundColor: STATE_COLOR[s] }}>{STATE_LABEL[s]}{answered ? " ✓" : ""}</span>
                  </button>
                  {isOpen && <CheckDetail r={r} advice={a} answer={answers[r.id]} />}
                </div>
              );
            })}
            {!visible.length && <Text className={styles.disclaimer}>No checks match these filters.</Text>}
          </div>
        </>
      )}

      {tab === "areas" && (
        <div>
          {AREAS.map((a) => {
            const s = scores.byArea[a];
            const scored = s.Pass + s.Partial + s.Fail;
            if (report.coverage.areasNotAssessed.includes(a)) {
              return (
                <div key={a} className={styles.scoreRow}>
                  <Text>{a}</Text>
                  <Text className={styles.sub}>Not assessed in this run</Text>
                  <Text className={styles.sub}>—</Text>
                </div>
              );
            }
            return (
              <div key={a} className={styles.scoreRow}>
                <Button appearance="transparent" size="small" style={{ justifyContent: "flex-start" }}
                  onClick={() => { setArea(a); setStateFilter("all"); setTab("checks"); }}>{a}</Button>
                <div>
                  <StackedBar s={s} />
                  <span className={styles.sub}>{s.Pass} pass · {s.Partial} partial · {s.Fail} fail{s.Manual + s.Error ? ` · ${s.Manual + s.Error} manual/error` : ""}{s.NotApplicable ? ` · ${s.NotApplicable} N/A` : ""}</span>
                </div>
                <Text weight="semibold">{scored ? `${s.score}%` : "—"}</Text>
              </div>
            );
          })}
        </div>
      )}

      {tab === "nis2" && (
        <div>
          {(Object.keys(NIS2_MEASURES) as Nis2Measure[]).map((m) => {
            const s = scores.byNis2[m];
            const scored = s.Pass + s.Partial + s.Fail;
            const manual = NIS2_MANUAL_CHECKS.filter((x) => x.measure === m);
            return (
              <div key={m} className={styles.scoreRow}>
                <Text><span className={styles.mono}>({m})</span> {NIS2_MEASURES[m]}</Text>
                <div>
                  {scored > 0 && <StackedBar s={s} />}
                  {manual.map((x) => <span key={x.text} className={styles.sub}>☐ {x.text}</span>)}
                </div>
                <Text className={styles.sub}>{scored ? `${s.score}% (${s.Pass}/${scored})` : "organisational"}</Text>
              </div>
            );
          })}
          <Text className={styles.disclaimer} block style={{ marginTop: "12px" }}>
            A technical readiness check, not a compliance statement. NIS2 / the Cyberbeveiligingswet also requires organisational measures that no tenant scan can verify.
          </Text>
        </div>
      )}

      <Text className={styles.disclaimer}>
        Check IDs refer to the CIS Microsoft 365 Foundations Benchmark® (Center for Internet Security). Titles and rules are IntuneShade's own wording; verify against the benchmark version you are licensed for.
      </Text>
    </div>
  );
}
