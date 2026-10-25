import { Fragment, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  ProgressBar,
  Tab,
  TabList,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  Bot24Regular,
  ClipboardTaskListLtr24Regular,
  DatabaseSearch24Regular,
  DocumentData24Regular,
  Lightbulb24Regular,
  PlayRegular,
  SettingsRegular,
  StopRegular,
} from "@fluentui/react-icons";
import PageHeader from "../layout/PageHeader";
import ModelSettingsPanel from "./ModelSettingsPanel";
import BenchmarkResults from "./BenchmarkResults";
import AgentOffice from "./AgentOffice";
import { ACCENTS, FONTS } from "../../theme/theme";
import { controlsForProfile } from "../../baseline";
import type { Profile } from "../../baseline/types";
import { useAgentRunStore, type AgentId, type LogEntry } from "../../store/agentRunStore";
import { useAgentModelStore } from "../../store/agentModelStore";
import { useApiKeyStore } from "../../store/apiKeyStore";
import { currentModel } from "../../services/ai/provider";
import { cancelBenchmark, runBenchmark } from "../../services/agents/orchestrator";

interface AgentDef {
  id: AgentId;
  name: string;
  role: string;
  icon: React.ReactElement;
  usesAi: boolean;
}

const AGENTS: AgentDef[] = [
  { id: "collector", name: "Collector", role: "Reads your tenant via Microsoft Graph (read-only)", icon: <DatabaseSearch24Regular />, usesAi: false },
  { id: "assessor", name: "Assessor", role: "Checks it against the IntuneShade Baseline (CIS / NIS2)", icon: <ClipboardTaskListLtr24Regular />, usesAi: false },
  { id: "advisor", name: "Advisor", role: "Explains what's missing and how to fix it", icon: <Lightbulb24Regular />, usesAi: true },
  { id: "reporter", name: "Reporter", role: "Scores everything and writes the report", icon: <DocumentData24Regular />, usesAi: true },
];

const VIEW_KEY = "intuneshade.agentView";

const AGENT_COLOR: Record<AgentId, string> = {
  collector: ACCENTS.iris,
  assessor: ACCENTS.amber,
  advisor: ACCENTS.mint,
  reporter: "#4FA3FF",
};

const LOG_COLOR: Record<LogEntry["kind"], string> = {
  info: tokens.colorNeutralForeground2,
  graph: ACCENTS.iris,
  ai: ACCENTS.mint,
  warn: ACCENTS.amber,
  error: ACCENTS.danger,
};

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  scroll: { flex: 1, overflowY: "auto", padding: "20px 28px 28px", display: "flex", flexDirection: "column", gap: "20px" },
  controls: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" },
  modelBadge: { fontSize: tokens.fontSizeBase200 },

  lane: {
    display: "grid",
    gridTemplateColumns: "1fr 56px 1fr 56px 1fr 56px 1fr",
    alignItems: "stretch",
    "@media (max-width: 1100px)": { gridTemplateColumns: "1fr", rowGap: "4px" },
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: "200ms",
    minWidth: 0,
  },
  cardWorking: { boxShadow: tokens.shadow16 },
  cardHead: { display: "flex", alignItems: "center", gap: "12px" },
  avatar: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "24px",
    flexShrink: 0,
    position: "relative",
  },
  pulse: {
    position: "absolute",
    inset: "-4px",
    borderRadius: "15px",
    border: "2px solid currentColor",
    animationName: {
      "0%": { opacity: 0.9, transform: "scale(1)" },
      "100%": { opacity: 0, transform: "scale(1.25)" },
    },
    animationDuration: "1.2s",
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-out",
  },
  name: { fontFamily: FONTS.display, fontWeight: 600, fontSize: "17px" },
  role: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  task: {
    fontFamily: FONTS.mono,
    fontSize: "12px",
    color: tokens.colorNeutralForeground2,
    minHeight: "32px",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  output: { fontSize: tokens.fontSizeBase200, fontWeight: 600 },

  connector: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    "@media (max-width: 1100px)": { height: "24px", justifyContent: "center" },
  },
  line: {
    width: "100%",
    height: "2px",
    backgroundImage: `linear-gradient(90deg, ${tokens.colorNeutralStroke1} 50%, transparent 50%)`,
    backgroundSize: "8px 2px",
    "@media (max-width: 1100px)": { width: "2px", height: "100%", backgroundSize: "2px 8px",
      backgroundImage: `linear-gradient(180deg, ${tokens.colorNeutralStroke1} 50%, transparent 50%)` },
  },
  packet: {
    position: "absolute",
    top: "50%",
    width: "14px",
    height: "14px",
    marginTop: "-7px",
    borderRadius: "4px",
    boxShadow: "0 0 12px currentColor",
    backgroundColor: "currentColor",
    animationName: { from: { left: "0%", opacity: 1 }, "85%": { opacity: 1 }, to: { left: "calc(100% - 14px)", opacity: 0 } },
    animationDuration: "1.1s",
    animationFillMode: "forwards",
    animationTimingFunction: "ease-in-out",
    "@media (max-width: 1100px)": { display: "none" },
  },
  packetLabel: {
    position: "absolute",
    top: "calc(50% + 10px)",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: FONTS.mono,
    fontSize: "10px",
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
    "@media (max-width: 1100px)": { position: "static" },
  },

  bottom: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, 380px) 1fr",
    gap: "20px",
    alignItems: "start",
    "@media (max-width: 1000px)": { gridTemplateColumns: "1fr" },
  },
  feed: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    maxHeight: "560px",
  },
  feedHead: { padding: "10px 14px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: "flex", justifyContent: "space-between" },
  feedBody: { overflowY: "auto", padding: "8px 14px", fontFamily: FONTS.mono, fontSize: "11.5px", lineHeight: "1.55" },
  feedLine: { display: "flex", gap: "8px" },
  feedTs: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
  feedAgent: { flexShrink: 0, width: "68px", fontWeight: 600 },
  empty: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300, padding: "24px 0" },
  error: { color: ACCENTS.danger },
});

function AgentCard({ def }: { def: AgentDef }) {
  const styles = useStyles();
  const state = useAgentRunStore((s) => s.agents[def.id]);
  const color = AGENT_COLOR[def.id];
  const model = currentModel();
  const working = state.status === "working";
  return (
    <div
      className={mergeClasses(styles.card, working && styles.cardWorking)}
      style={{ borderColor: working || state.status === "done" ? color : undefined }}
    >
      <div className={styles.cardHead}>
        <div className={styles.avatar} style={{ color, backgroundColor: `${color}22` }}>
          {def.icon}
          {working && <span className={styles.pulse} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <Text className={styles.name} block>{def.name}</Text>
          <Text className={styles.role}>{def.role}</Text>
        </div>
      </div>
      <div>
        {def.usesAi ? (
          <Tooltip content={model.leavesDevice ? `Findings are sent to ${model.recipient}` : "Runs on this device"} relationship="description">
            <Badge appearance="tint" color={model.leavesDevice ? "warning" : "success"} size="small">
              {model.leavesDevice ? "Leaves device · " : ""}{model.label}
            </Badge>
          </Tooltip>
        ) : (
          <Badge appearance="tint" color="informative" size="small">Deterministic · no AI</Badge>
        )}
      </div>
      <Text className={styles.task}>{state.status === "idle" ? "Waiting" : state.task}</Text>
      <ProgressBar
        value={state.progress}
        thickness="large"
        color={state.status === "error" ? "error" : state.status === "done" ? "success" : "brand"}
      />
      {state.output && <Text className={styles.output} style={{ color }}>{state.output}</Text>}
    </div>
  );
}

function Connector({ from }: { from: AgentId }) {
  const styles = useStyles();
  const handoff = useAgentRunStore((s) => s.handoff);
  const active = handoff?.from === from;
  return (
    <div className={styles.connector}>
      <div className={styles.line} />
      {active && (
        <>
          <span key={handoff.seq} className={styles.packet} style={{ color: AGENT_COLOR[from] }} />
          <span className={styles.packetLabel}>{handoff.label} →</span>
        </>
      )}
    </div>
  );
}

function ActivityFeed() {
  const styles = useStyles();
  const log = useAgentRunStore((s) => s.log);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log.length]);
  return (
    <div className={styles.feed}>
      <div className={styles.feedHead}>
        <Text weight="semibold">Activity</Text>
        <Text className={styles.role}>Graph endpoints only, no tenant data</Text>
      </div>
      <div className={styles.feedBody} ref={ref}>
        {!log.length && <div className={styles.empty}>Start a benchmark to watch the agents work.</div>}
        {log.map((e) => (
          <div key={e.id} className={styles.feedLine}>
            <span className={styles.feedTs}>{new Date(e.ts).toLocaleTimeString([], { hour12: false })}</span>
            <span className={styles.feedAgent} style={{ color: AGENT_COLOR[e.agent] }}>{e.agent}</span>
            <span style={{ color: LOG_COLOR[e.kind], wordBreak: "break-word" }}>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AgentPlacePage() {
  const styles = useStyles();
  const { running, profile, setProfile, report, findings, advice, error } = useAgentRunStore();
  // Subscribe so badges re-render when the model or key changes.
  useAgentModelStore((s) => s.engine);
  useApiKeyStore((s) => s.apiKey);
  const model = currentModel();
  const count = controlsForProfile(profile).length;
  const [view, setView] = useState<"office" | "cards">(() => {
    try { return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "office"; } catch { return "office"; }
  });
  const changeView = (v: "office" | "cards") => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  };

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="IntuneShade Baseline"
        title="Place for your agents"
        subtitle="Four agents benchmark your tenant against the IntuneShade Baseline, with CIS references and a NIS2 view. Collection and scoring are read-only and deterministic; AI only explains and summarises."
        icon={<Bot24Regular />}
      />
      <div className={styles.scroll}>
        <div className={styles.controls}>
          <TabList selectedValue={profile} onTabSelect={(_, d) => setProfile(d.value as Profile)} disabled={running} size="small">
            <Tab value="L1">Level 1</Tab>
            <Tab value="L2">Level 2</Tab>
            <Tab value="Extended">Extended</Tab>
          </TabList>
          <Text className={styles.role}>{count} controls</Text>
          <div style={{ flex: 1 }} />
          <TabList selectedValue={view} onTabSelect={(_, d) => changeView(d.value as "office" | "cards")} size="small" appearance="subtle">
            <Tab value="office">Office</Tab>
            <Tab value="cards">Cards</Tab>
          </TabList>
          <Popover positioning="below-end" withArrow>
            <PopoverTrigger disableButtonEnhancement>
              <Button icon={<SettingsRegular />} disabled={running}>
                Model: {model.label}
              </Button>
            </PopoverTrigger>
            <PopoverSurface><ModelSettingsPanel /></PopoverSurface>
          </Popover>
          {running ? (
            <Button icon={<StopRegular />} onClick={cancelBenchmark}>Cancel</Button>
          ) : (
            <Button appearance="primary" icon={<PlayRegular />} onClick={() => void runBenchmark(profile)}>
              {report ? "Run again" : "Start benchmark"}
            </Button>
          )}
        </div>

        {view === "office" ? (
          <AgentOffice />
        ) : (
          <div className={styles.lane}>
            {AGENTS.map((a, i) => (
              <Fragment key={a.id}>
                <AgentCard def={a} />
                {i < AGENTS.length - 1 && <Connector from={a.id} />}
              </Fragment>
            ))}
          </div>
        )}

        {error && <Text className={styles.error}>Benchmark stopped: {error}</Text>}

        <div className={styles.bottom}>
          <ActivityFeed />
          {report ? (
            <BenchmarkResults report={report} findings={findings} advice={advice} />
          ) : (
            <Text className={styles.empty}>
              Results appear here when the Reporter is done. The first run asks you to consent to two extra read-only permissions (Policy.Read.All, RoleManagement.Read.Directory).
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}
