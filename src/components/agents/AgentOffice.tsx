// ─── Agent office ─────────────────────────────────────────────────────────────
// An animated office where the four agents sit at their desks, walk to the
// server rack (Microsoft Graph), carry their output to the next colleague and
// print the report. Pure SVG/CSS driven by agentRunStore — no canvas, no deps.
//
// The stage is drawn at a fixed 1000×380 and scaled to the container width.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { useAgentRunStore, type AgentId, type AgentState } from "../../store/agentRunStore";

const STAGE_W = 1000;
const STAGE_H = 380;
const WALK_SPEED = 240; // px per second

/** Character top-left positions (characters are 50×100). */
const DESK_X: Record<AgentId, number> = { collector: 210, assessor: 400, advisor: 590, reporter: 780 };
const DESK_ROW_Y = 138;
const LANE_Y = 244;
const RACK_SPOT = { x: 100, y: 190 };
const PRINTER_SPOT = { x: 880, y: 190 };

const ORDER: AgentId[] = ["collector", "assessor", "advisor", "reporter"];

interface Look { name: string; shirt: string; skin: string; hair: string }
const LOOKS: Record<AgentId, Look> = {
  collector: { name: "Collector", shirt: "#6E62E5", skin: "#f1c27d", hair: "#2b1d14" },
  assessor: { name: "Assessor", shirt: "#FFB020", skin: "#c68642", hair: "#111111" },
  advisor: { name: "Advisor", shirt: "#3DDC97", skin: "#e0ac69", hair: "#7a4a1f" },
  reporter: { name: "Reporter", shirt: "#4FA3FF", skin: "#8d5524", hair: "#1c1c1c" },
};

interface Pos { x: number; y: number }

const deskSpot = (id: AgentId): Pos => ({ x: DESK_X[id], y: DESK_ROW_Y });
/** Where a colleague stands when dropping work off at someone's desk. */
const visitSpot = (id: AgentId): Pos => ({ x: DESK_X[id] - 46, y: LANE_Y });

/** Desk row → walking lane → across → destination. */
function route(from: Pos, to: Pos): Pos[] {
  if (from.x === to.x && from.y === to.y) return [];
  if (Math.abs(from.x - to.x) < 4) return [to];
  return [{ x: from.x, y: LANE_Y }, { x: to.x, y: LANE_Y }, to].filter(
    (p, i, arr) => i === 0 ? !(p.x === from.x && p.y === from.y) : !(p.x === arr[i - 1].x && p.y === arr[i - 1].y),
  );
}

function segMs(a: Pos, b: Pos): number {
  return Math.max(250, (Math.hypot(a.x - b.x, a.y - b.y) / WALK_SPEED) * 1000);
}

function routeMs(from: Pos, to: Pos): number {
  let prev = from;
  let total = 0;
  for (const p of route(from, to)) {
    total += segMs(prev, p);
    prev = p;
  }
  return total;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  frame: {
    position: "relative",
    width: "100%",
    borderRadius: "14px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    backgroundColor: "#141823",
    contain: "layout paint",
    flexShrink: 0,
  },
  /** Ambient animations stop when the office is quiet or scrolled out of view. */
  paused: {
    "& *, & *::after": { animationPlayState: "paused !important" },
  },
  stage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: `${STAGE_W}px`,
    height: `${STAGE_H}px`,
    transformOrigin: "0 0",
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  abs: { position: "absolute" },

  // room
  wall: {
    position: "absolute", left: 0, top: 0, width: "100%", height: "262px",
    backgroundImage: "linear-gradient(180deg, #232a3b 0%, #1b2130 100%)",
  },
  skirting: { position: "absolute", left: 0, top: "258px", width: "100%", height: "6px", backgroundColor: "#0f121a" },
  floor: {
    position: "absolute", left: 0, top: "264px", width: "100%", height: "116px",
    backgroundColor: "#2a2420",
    backgroundImage: "repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 120px), linear-gradient(180deg, #3a3029, #2a221d)",
  },
  window: {
    position: "absolute", left: "300px", top: "18px", width: "200px", height: "96px",
    borderRadius: "6px", border: "6px solid #39425a", overflow: "hidden",
    backgroundImage: "linear-gradient(180deg, #5b8bd6 0%, #9cc3f0 100%)",
  },
  windowBar: { position: "absolute", left: "94px", top: 0, width: "6px", height: "100%", backgroundColor: "#39425a" },
  cloud: {
    position: "absolute", top: "18px", width: "54px", height: "16px", borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.85)",
    animationName: { from: { transform: "translateX(-70px)" }, to: { transform: "translateX(230px)" } },
    animationDuration: "38s", animationIterationCount: "infinite", animationTimingFunction: "linear",
  },
  board: {
    position: "absolute", left: "560px", top: "16px", width: "220px", height: "98px",
    backgroundColor: "#f4f5f7", borderRadius: "4px", border: "5px solid #8a8f99",
    color: "#1b1d24", padding: "8px 12px", boxSizing: "border-box",
  },
  boardTitle: { fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#6E62E5" },
  boardScore: { fontSize: "32px", fontWeight: 700, lineHeight: "1.1" },
  boardSub: { fontSize: "11px", color: "#555" },
  clock: {
    position: "absolute", left: "838px", top: "34px", width: "54px", height: "54px",
    borderRadius: "50%", backgroundColor: "#f4f5f7", border: "4px solid #39425a",
  },
  hand: {
    position: "absolute", left: "50%", bottom: "50%", width: "2px", marginLeft: "-1px",
    backgroundColor: "#1b1d24", transformOrigin: "50% 100%",
    animationName: { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
    animationIterationCount: "infinite", animationTimingFunction: "linear",
  },
  lamp: {
    position: "absolute", top: 0, width: "70px", height: "14px", marginLeft: "-35px",
    backgroundColor: "#39425a", borderRadius: "0 0 35px 35px",
    "::after": {
      content: '""', position: "absolute", left: "-40px", top: "14px", width: "150px", height: "120px",
      backgroundImage: "radial-gradient(ellipse at top, rgba(255,230,160,0.12), transparent 70%)",
    },
  },

  // server rack
  rack: {
    position: "absolute", left: "22px", top: "92px", width: "70px", height: "172px",
    backgroundColor: "#0d1017", borderRadius: "4px", border: "2px solid #39425a",
    display: "flex", flexDirection: "column", gap: "6px", padding: "8px 6px", boxSizing: "border-box",
  },
  rackUnit: {
    height: "16px", backgroundColor: "#1a1f2b", borderRadius: "2px",
    display: "flex", alignItems: "center", gap: "4px", padding: "0 5px",
  },
  led: { width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "#3DDC97" },
  ledBusy: {
    animationName: { "0%": { opacity: 1 }, "50%": { opacity: 0.15 }, "100%": { opacity: 1 } },
    animationDuration: "0.35s", animationIterationCount: "infinite",
  },
  rackLabel: {
    position: "absolute", left: "10px", top: "70px", width: "96px", textAlign: "center",
    fontSize: "10px", fontWeight: 700, color: "#9aa3b5", letterSpacing: "0.06em",
  },

  // printer
  printer: {
    position: "absolute", left: "930px", top: "214px", width: "58px", height: "48px",
    backgroundColor: "#d9dce3", borderRadius: "6px", border: "2px solid #8a8f99",
  },
  paper: {
    position: "absolute", left: "10px", top: "-22px", width: "34px", height: "26px",
    backgroundColor: "#fff", border: "1px solid #ccc",
    animationName: { from: { transform: "translateY(18px)" }, to: { transform: "translateY(0)" } },
    animationDuration: "1.2s", animationIterationCount: "infinite", animationDirection: "alternate",
  },

  // desks
  desk: { position: "absolute", width: "170px", height: "80px", zIndex: 3 },
  deskTop: {
    position: "absolute", left: 0, top: 0, width: "100%", height: "12px", borderRadius: "3px",
    backgroundColor: "#8a6a4f",
  },
  deskFront: {
    position: "absolute", left: "8px", top: "12px", width: "154px", height: "60px",
    backgroundColor: "#6b4f3a", borderRadius: "0 0 4px 4px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  plate: {
    fontSize: "11px", fontWeight: 700, color: "#f4f5f7", padding: "3px 8px", borderRadius: "4px",
    backgroundColor: "rgba(0,0,0,0.35)", letterSpacing: "0.04em",
  },
  laptop: {
    position: "absolute", left: "58px", top: "-26px", width: "54px", height: "28px",
    backgroundColor: "#2b2f3a", borderRadius: "4px 4px 0 0", border: "2px solid #4a5163",
    boxSizing: "border-box",
  },
  laptopOn: { boxShadow: "0 -8px 22px 2px var(--glow)" },
  mug: {
    position: "absolute", left: "128px", top: "-14px", width: "12px", height: "14px",
    backgroundColor: "#f4f5f7", borderRadius: "0 0 3px 3px",
  },
  steam: {
    position: "absolute", left: "3px", top: "-14px", width: "6px", height: "12px",
    borderLeft: "2px solid rgba(255,255,255,0.45)", borderRadius: "50%",
    animationName: { "0%": { opacity: 0, transform: "translateY(4px)" }, "50%": { opacity: 1 }, "100%": { opacity: 0, transform: "translateY(-6px)" } },
    animationDuration: "2.4s", animationIterationCount: "infinite",
  },

  // characters
  agent: { position: "absolute", width: "50px", height: "100px", transitionProperty: "left, top", transitionTimingFunction: "linear" },
  legL: { transformOrigin: "20px 62px", transformBox: "view-box" },
  legR: { transformOrigin: "30px 62px", transformBox: "view-box" },
  walkL: {
    animationName: { "0%": { transform: "rotate(18deg)" }, "50%": { transform: "rotate(-18deg)" }, "100%": { transform: "rotate(18deg)" } },
    animationDuration: "0.5s", animationIterationCount: "infinite",
  },
  walkR: {
    animationName: { "0%": { transform: "rotate(-18deg)" }, "50%": { transform: "rotate(18deg)" }, "100%": { transform: "rotate(-18deg)" } },
    animationDuration: "0.5s", animationIterationCount: "infinite",
  },
  bob: {
    animationName: { "0%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-3px)" }, "100%": { transform: "translateY(0)" } },
    animationDuration: "0.25s", animationIterationCount: "infinite",
  },
  armTypeL: {
    transformOrigin: "9px 38px", transformBox: "view-box",
    animationName: { "0%": { transform: "rotate(-28deg)" }, "50%": { transform: "rotate(-40deg)" }, "100%": { transform: "rotate(-28deg)" } },
    animationDuration: "0.22s", animationIterationCount: "infinite",
  },
  armTypeR: {
    transformOrigin: "41px 38px", transformBox: "view-box",
    animationName: { "0%": { transform: "rotate(40deg)" }, "50%": { transform: "rotate(28deg)" }, "100%": { transform: "rotate(40deg)" } },
    animationDuration: "0.22s", animationIterationCount: "infinite",
    animationDelay: "0.11s",
  },
  blink: {
    transformOrigin: "25px 20px", transformBox: "view-box",
    animationName: { "0%, 92%, 100%": { transform: "scaleY(1)" }, "96%": { transform: "scaleY(0.1)" } },
    animationDuration: "4s", animationIterationCount: "infinite",
  },
  bubble: {
    position: "absolute", bottom: "104px", left: "50%", transform: "translateX(-50%)",
    backgroundColor: "#f4f5f7", color: "#1b1d24", fontSize: "11px", lineHeight: "1.3",
    padding: "5px 9px", borderRadius: "9px", whiteSpace: "nowrap", maxWidth: "190px",
    overflow: "hidden", textOverflow: "ellipsis", boxShadow: "0 4px 10px rgba(0,0,0,0.35)",
    "::after": {
      content: '""', position: "absolute", left: "50%", bottom: "-5px", marginLeft: "-5px",
      borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #f4f5f7",
    },
  },
  badge: {
    position: "absolute", bottom: "104px", left: "50%", marginLeft: "-11px", width: "22px", height: "22px",
    borderRadius: "50%", color: "#fff", fontSize: "13px", fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 8px rgba(0,0,0,0.35)",
  },
  zzz: {
    position: "absolute", bottom: "100px", left: "34px", fontSize: "12px", fontWeight: 700, color: "#9aa3b5",
    animationName: { "0%": { opacity: 0, transform: "translate(0,4px)" }, "50%": { opacity: 1 }, "100%": { opacity: 0, transform: "translate(8px,-10px)" } },
    animationDuration: "3s", animationIterationCount: "infinite",
  },
});

// ─── Character ────────────────────────────────────────────────────────────────

interface CharacterProps {
  id: AgentId;
  pos: Pos;
  stepMs: number;
  walking: boolean;
  typing: boolean;
  carrying: boolean;
  bubble: string | null;
  state: AgentState;
  showIdle: boolean;
}

function Character({ id, pos, stepMs, walking, typing, carrying, bubble, state, showIdle }: CharacterProps) {
  const s = useStyles();
  const look = LOOKS[id];
  const inFront = pos.y > DESK_ROW_Y + 2 || walking;
  return (
    <div
      className={s.agent}
      style={{ left: pos.x, top: pos.y, transitionDuration: `${stepMs}ms`, zIndex: inFront ? 5 : 2 }}
      aria-label={`${look.name}: ${state.task}`}
    >
      {bubble ? (
        <div className={s.bubble}>{bubble}</div>
      ) : state.status === "done" && !walking ? (
        <div className={s.badge} style={{ backgroundColor: "#1f9d55" }}>✓</div>
      ) : state.status === "error" ? (
        <div className={s.badge} style={{ backgroundColor: "#d64545" }}>!</div>
      ) : showIdle ? (
        <div className={s.zzz}>z z</div>
      ) : null}

      <svg width="50" height="100" viewBox="0 0 50 100" className={walking ? s.bob : undefined}>
        {/* legs */}
        <rect className={mergeClasses(s.legL, walking && s.walkL)} x="17" y="62" width="7" height="36" rx="3" fill="#2b2f3a" />
        <rect className={mergeClasses(s.legR, walking && s.walkR)} x="26" y="62" width="7" height="36" rx="3" fill="#2b2f3a" />
        {/* body */}
        <rect x="11" y="34" width="28" height="32" rx="8" fill={look.shirt} />
        <rect x="21" y="34" width="8" height="10" rx="2" fill="rgba(255,255,255,0.35)" />
        {/* arms */}
        <rect className={typing ? s.armTypeL : undefined} x="5" y="37" width="7" height="24" rx="3.5" fill={look.shirt} />
        <rect className={typing ? s.armTypeR : undefined} x="38" y="37" width="7" height="24" rx="3.5" fill={look.shirt} />
        {/* head */}
        <circle cx="25" cy="20" r="12" fill={look.skin} />
        <path d="M13 19 a12 12 0 0 1 24 0 q-6 -5 -12 -4 q-7 1 -12 4z" fill={look.hair} />
        <g className={s.blink}>
          <circle cx="20.5" cy="21" r="1.6" fill="#1b1d24" />
          <circle cx="29.5" cy="21" r="1.6" fill="#1b1d24" />
        </g>
        <path d="M21 26 q4 3 8 0" stroke="#1b1d24" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        {/* folder being carried */}
        {carrying && (
          <g>
            <rect x="14" y="44" width="24" height="18" rx="2" fill="#f2c94c" stroke="#b8902a" />
            <rect x="14" y="41" width="10" height="5" rx="1.5" fill="#f2c94c" stroke="#b8902a" />
          </g>
        )}
      </svg>
    </div>
  );
}

// ─── Movement ─────────────────────────────────────────────────────────────────

/** Walks a character along waypoints to `target`, one CSS transition per segment. */
function useWalker(target: Pos) {
  const [pos, setPos] = useState<Pos>(target);
  const [stepMs, setStepMs] = useState(0);
  const [walking, setWalking] = useState(false);
  const posRef = useRef<Pos>(target);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const path = route(posRef.current, target);
    if (!path.length) return;
    let delay = 0;
    let prev = posRef.current;
    for (const p of path) {
      const ms = segMs(prev, p);
      timers.current.push(window.setTimeout(() => {
        setWalking(true);
        setStepMs(ms);
        setPos(p);
        posRef.current = p;
      }, delay));
      delay += ms;
      prev = p;
    }
    timers.current.push(window.setTimeout(() => setWalking(false), delay));
    return () => timers.current.forEach(clearTimeout);
  }, [target.x, target.y]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pos, stepMs, walking };
}

interface Courier { from: AgentId; to: AgentId; label: string; seq: number }

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function OfficeAgent({ id, courier }: { id: AgentId; courier: Courier | null }) {
  const state = useAgentRunStore((st) => st.agents[id]);
  const running = useAgentRunStore((st) => st.running);
  const delivering = courier?.from === id;

  let target = deskSpot(id);
  if (delivering) target = visitSpot(courier.to);
  else if (id === "collector" && state.status === "working") target = RACK_SPOT;
  else if (id === "reporter" && state.status === "working" && state.progress >= 0.5) target = PRINTER_SPOT;

  const { pos, stepMs, walking } = useWalker(target);
  const atDesk = pos.x === DESK_X[id] && pos.y === DESK_ROW_Y && !walking;

  const bubble = delivering
    ? `${courier.label} →`
    : state.status === "working" && !walking
      ? truncate(state.task, 34)
      : null;

  return (
    <Character
      id={id}
      pos={pos}
      stepMs={stepMs}
      walking={walking}
      typing={atDesk && state.status === "working"}
      carrying={delivering}
      bubble={bubble}
      state={state}
      showIdle={!running && state.status === "idle"}
    />
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export default function AgentOffice() {
  const s = useStyles();
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [visible, setVisible] = useState(true);
  const runId = useAgentRunStore((st) => st.runId);
  const [quietRun, setQuietRun] = useState(0);
  const agents = useAgentRunStore((st) => st.agents);
  const handoff = useAgentRunStore((st) => st.handoff);
  const running = useAgentRunStore((st) => st.running);
  const report = useAgentRunStore((st) => st.report);
  // The courier walk lasts until its timer marks this hand-off as delivered.
  const [deliveredSeq, setDeliveredSeq] = useState(0);
  const courier: Courier | null = handoff && handoff.seq !== deliveredSeq ? handoff : null;

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / STAGE_W));
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  // Keep animating a few seconds after a run so the last walk-back finishes.
  useEffect(() => {
    if (running) return;
    const t = window.setTimeout(() => setQuietRun(runId), 6000);
    return () => clearTimeout(t);
  }, [running, runId]);
  const animate = visible && (running || quietRun !== runId);

  // A hand-off sends the finished agent to the next desk with a folder, then home.
  useEffect(() => {
    if (!handoff) return;
    const start = handoff.from === "collector" ? RACK_SPOT : deskSpot(handoff.from);
    const there = routeMs(start, visitSpot(handoff.to));
    const t = window.setTimeout(() => setDeliveredSeq(handoff.seq), there + 1100);
    return () => clearTimeout(t);
  }, [handoff]);

  const collectorBusy = agents.collector.status === "working";
  const printing = agents.reporter.status === "working" && agents.reporter.progress >= 0.5;
  const boardTitle = running ? "BENCHMARK RUNNING" : report ? "CIS L1 SCORE" : "INTUNESHADE BASELINE";
  const boardMain = report && !running ? `${report.overall.score}%` : running ? "…" : "CIS L1";
  const boardSub = report && !running
    ? `${report.overall.Pass} pass · ${report.overall.Partial} partial · ${report.overall.Fail} fail`
    : running
      ? (ORDER.find((a) => agents[a].status === "working") ?? "starting") + " at work"
      : "Press Start benchmark";

  return (
    <div ref={frameRef} className={mergeClasses(s.frame, !animate && s.paused)} style={{ height: STAGE_H * scale }} role="img"
      aria-label="Animated office showing the four benchmark agents at work">
      <div className={s.stage} style={{ transform: `scale(${scale})` }}>
        {/* room */}
        <div className={s.wall} />
        <div className={s.lamp} style={{ left: 260 }} />
        <div className={s.lamp} style={{ left: 640 }} />
        <div className={s.window}>
          <div className={s.cloud} />
          <div className={s.cloud} style={{ top: 58, animationDelay: "-19s", width: 40 }} />
          <div className={s.windowBar} />
        </div>
        <div className={s.board}>
          <div className={s.boardTitle}>{boardTitle}</div>
          <div className={s.boardScore}>{boardMain}</div>
          <div className={s.boardSub}>{boardSub}</div>
        </div>
        <div className={s.clock}>
          <div className={s.hand} style={{ height: 15, animationDuration: "3600s", width: 3, marginLeft: -1.5 }} />
          <div className={s.hand} style={{ height: 21, animationDuration: "60s", backgroundColor: "#d64545", width: 1 }} />
        </div>
        <div className={s.skirting} />
        <div className={s.floor} />

        {/* server rack = Microsoft Graph */}
        <div className={s.rack}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={s.rackUnit}>
              <span className={mergeClasses(s.led, collectorBusy && s.ledBusy)} style={{ animationDelay: `${i * 0.07}s` }} />
              <span className={mergeClasses(s.led, collectorBusy && s.ledBusy)}
                style={{ backgroundColor: i % 3 ? "#3DDC97" : "#FFB020", animationDelay: `${i * 0.11}s` }} />
            </div>
          ))}
        </div>
        <div className={s.rackLabel} style={{ top: 268 }}>MICROSOFT GRAPH</div>

        {/* printer */}
        <div className={s.printer}>{(printing || (report && !running)) && <div className={s.paper} />}</div>

        {/* desks */}
        {ORDER.map((id) => {
          const working = agents[id].status === "working";
          return (
            <div key={id} className={s.desk} style={{ left: DESK_X[id] - 60, top: 200 }}>
              <div className={mergeClasses(s.laptop, working && s.laptopOn)}
                style={{ ["--glow" as string]: `${LOOKS[id].shirt}aa` }} />
              <div className={s.mug}><div className={s.steam} /></div>
              <div className={s.deskTop} />
              <div className={s.deskFront}><span className={s.plate}>{LOOKS[id].name}</span></div>
            </div>
          );
        })}

        {/* agents */}
        {ORDER.map((id) => <OfficeAgent key={id} id={id} courier={courier} />)}
      </div>
    </div>
  );
}
