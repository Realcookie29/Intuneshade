import { useEffect, useRef, useState } from "react";
import { makeStyles, mergeClasses, Spinner } from "@fluentui/react-components";

/*
 * A self-contained, looping "product screencast" for the landing page.
 * Everything is fictional, with no tenant data. Four scenes cycle automatically:
 * Matrix → Report → Compare → Membership. Respects prefers-reduced-motion.
 */

const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
const FONT_UI = "'Inter', system-ui, sans-serif";
const INCLUDE = "#3DDC97";
const EXCLUDE = "#FF6B7A";
const IRIS = "#8F86EE";
const AMBER = "#FFB020";

const SCENES = [
  { id: "matrix", file: "assignment-matrix", caption: "See every group × policy assignment in one grid" },
  { id: "compliance", file: "device-compliance", caption: "See who's compliant, and why the rest aren't" },
  { id: "report", file: "assignment-report.html", caption: "Generate a shareable HTML report in one click" },
  { id: "compare", file: "device-compare", caption: "Compare exactly what two devices receive" },
  { id: "tags", file: "autopilot-group-tags", caption: "Bulk-tag Windows Autopilot devices" },
  { id: "members", file: "group-membership", caption: "Add and remove members without leaving the tool" },
] as const;

const GROUPS = ["Contoso-All-Devices", "Sales-Pilot", "Finance-Kiosks", "All Users", "Frontline-Excl"];
const COLS = ["Apps", "Config", "Compliance", "Scripts", "Baselines"];
// Fictional cell values: [include, exclude] counts per (group,col); 0 = empty.
const CELLS: [number, number][][] = [
  [[12, 0], [8, 0], [3, 0], [2, 0], [0, 0]],
  [[4, 0], [6, 0], [0, 0], [1, 0], [1, 0]],
  [[3, 0], [2, 0], [1, 0], [0, 0], [0, 0]],
  [[2, 0], [0, 0], [1, 0], [0, 0], [0, 0]],
  [[0, 3], [0, 1], [0, 0], [0, 0], [0, 0]],
];

const useStyles = makeStyles({
  frame: {
    borderRadius: "14px",
    overflow: "hidden",
    background: "#0E1017",
    border: "1px solid #20242F",
    boxShadow: "0 30px 70px rgba(30,24,10,0.28), 0 4px 14px rgba(0,0,0,0.18)",
    width: "100%",
    fontFamily: FONT_UI,
    color: "#E6E8EE",
  },
  bar: {
    display: "flex", alignItems: "center", gap: "7px",
    padding: "11px 14px", background: "#131620", borderBottom: "1px solid #1C212C",
  },
  dot: { width: "10px", height: "10px", borderRadius: "50%" },
  file: {
    marginLeft: "8px", fontFamily: FONT_MONO, fontSize: "12px", color: "#7B8291",
    letterSpacing: "0.01em",
  },
  live: {
    marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px",
    fontFamily: FONT_MONO, fontSize: "10.5px", color: "#8A93A6", textTransform: "uppercase", letterSpacing: "0.14em",
  },
  liveDot: { width: "6px", height: "6px", borderRadius: "50%", background: INCLUDE },
  stage: {
    position: "relative",
    height: "336px",
    padding: "18px 18px 14px",
    overflow: "hidden",
  },
  caption: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
    padding: "12px 16px", borderTop: "1px solid #1C212C", background: "#0B0D13",
  },
  capText: { fontSize: "13px", color: "#AEB4C2" },
  scDots: { display: "flex", gap: "6px" },
  scDot: {
    width: "22px", height: "4px", borderRadius: "2px", background: "#252B38", border: "none",
    padding: 0, cursor: "pointer", transition: "background .2s",
  },
  scDotActive: { background: AMBER },

  // shared entrance
  row: { animationName: { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "none" } },
        animationDuration: "0.5s", animationFillMode: "both", animationTimingFunction: "cubic-bezier(.2,.7,.2,1)" },

  // ── Matrix ──
  mtx: { display: "grid", gridTemplateColumns: "132px repeat(5, 1fr)", gap: "1px", background: "#171B24", border: "1px solid #1C212C", borderRadius: "8px", overflow: "hidden", fontSize: "12px" },
  mtxHead: { background: "#131620", padding: "9px 8px", fontFamily: FONT_MONO, fontSize: "10.5px", color: "#8A93A6", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" },
  mtxRowHead: { background: "#0E1017", padding: "9px 10px", fontFamily: FONT_MONO, fontSize: "11px", color: "#C6C9D6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  mtxCell: { background: "#0E1017", padding: "9px 8px", textAlign: "center", fontFamily: FONT_MONO, fontSize: "11.5px", fontWeight: 600 },

  // ── Report ──
  tiles: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "14px" },
  tile: { border: "1px solid #1C212C", borderRadius: "10px", padding: "14px", background: "#12141C", position: "relative" },
  tileBar: { position: "absolute", left: 0, top: "13px", bottom: "13px", width: "3px", borderRadius: "0 2px 2px 0" },
  tileVal: { fontFamily: FONT_MONO, fontSize: "26px", fontWeight: 700, lineHeight: 1 },
  tileLabel: { fontSize: "11px", color: "#7B8291", marginTop: "6px", textTransform: "uppercase", letterSpacing: "0.05em" },
  secBar: { display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", border: "1px solid #1C212C", borderRadius: "8px", marginBottom: "8px", background: "#0E1017" },
  secName: { fontFamily: FONT_MONO, fontSize: "12px", color: "#C6C9D6", flex: 1 },
  dlPill: { display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 14px", borderRadius: "8px", background: AMBER, color: "#241a02", fontSize: "13px", fontWeight: 600, marginTop: "4px" },

  // ── Compare ──
  cmpGrid: { display: "grid", gridTemplateColumns: "1fr 92px 92px", gap: "1px", background: "#171B24", border: "1px solid #1C212C", borderRadius: "8px", overflow: "hidden", fontSize: "12px" },
  cmpHead: { background: "#131620", padding: "9px 10px", fontFamily: FONT_MONO, fontSize: "11px", color: "#C6C9D6" },
  cmpHeadC: { textAlign: "center", color: "#8A93A6", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.05em" },
  cmpCell: { background: "#0E1017", padding: "9px 10px", fontFamily: FONT_MONO, fontSize: "11.5px", color: "#AEB4C2" },
  cmpMark: { background: "#0E1017", padding: "9px 8px", textAlign: "center", fontWeight: 700, fontFamily: FONT_MONO },

  // ── Compliance ──
  cmpWrap: { display: "flex", alignItems: "center", gap: "26px", padding: "18px 8px" },
  donut: { width: "132px", height: "132px", borderRadius: "50%", flexShrink: 0, position: "relative" },
  donutHole: {
    position: "absolute", inset: "20px", borderRadius: "50%", background: "#0E1017",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  },
  donutPct: { fontFamily: FONT_MONO, fontSize: "26px", fontWeight: 700, color: INCLUDE, lineHeight: 1 },
  donutSub: { fontSize: "10px", color: "#7B8291", marginTop: "2px" },
  legend: { display: "flex", flexDirection: "column", gap: "8px", flex: 1 },
  legRow: { display: "grid", gridTemplateColumns: "12px 1fr auto", gap: "10px", alignItems: "center", fontSize: "12.5px" },
  legDot: { width: "10px", height: "10px", borderRadius: "3px" },
  legPct: { fontFamily: FONT_MONO, fontSize: "12px", color: "#AEB4C2" },

  // ── Tags ──
  tags: { display: "flex", flexDirection: "column", gap: "1px", background: "#171B24", border: "1px solid #1C212C", borderRadius: "8px", overflow: "hidden" },
  tagRow: { display: "grid", gridTemplateColumns: "1fr 120px", alignItems: "center", gap: "10px", background: "#0E1017", padding: "11px 14px" },
  tagSerial: { fontFamily: FONT_MONO, fontSize: "12px", color: "#C6C9D6" },
  tagPill: { justifySelf: "start", fontFamily: FONT_MONO, fontSize: "11px", padding: "2px 9px", borderRadius: "999px", background: "rgba(110,98,229,.18)", color: "#B2ABF5" },
  tagAssigning: { justifySelf: "start", fontFamily: FONT_MONO, fontSize: "11px", color: "#FFC65C", display: "inline-flex", alignItems: "center", gap: "6px" },

  // ── Members ──
  memHead: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid #1C212C", borderRadius: "8px", background: "#12141C", marginBottom: "10px" },
  memTitle: { fontFamily: FONT_MONO, fontSize: "12px", color: "#C6C9D6" },
  memCount: { marginLeft: "auto", fontFamily: FONT_MONO, fontSize: "11px", color: "#7B8291" },
  memRow: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderBottom: "1px solid #14181F", fontSize: "12.5px" },
  avatar: { width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "#0E1017", flexShrink: 0 },
  tag: { marginLeft: "auto", fontFamily: FONT_MONO, fontSize: "10px", padding: "2px 8px", borderRadius: "999px", fontWeight: 600 },
});

function Cell({ v, delay, styles }: { v: [number, number]; delay: number; styles: ReturnType<typeof useStyles> }) {
  const [inc, exc] = v;
  return (
    <div className={mergeClasses(styles.mtxCell, styles.row)} style={{ animationDelay: `${delay}ms` }}>
      {inc === 0 && exc === 0 ? (
        <span style={{ color: "#39414F" }}>·</span>
      ) : (
        <>
          {inc > 0 && <span style={{ color: INCLUDE }}>●{inc}</span>}
          {exc > 0 && <span style={{ color: EXCLUDE, marginLeft: inc > 0 ? 5 : 0 }}>⊘{exc}</span>}
        </>
      )}
    </div>
  );
}

function useCountUp(target: number, run: boolean, ms = 700) {
  const [n, setN] = useState(run ? 0 : target);
  const raf = useRef(0);
  useEffect(() => {
    if (!run) return; // initial state is already the target when not running
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let start = 0;
    const tick = (t: number) => {
      if (reduce) { setN(target); return; }
      if (!start) start = t;
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, run, ms]);
  return n;
}

function ReportScene({ styles, active }: { styles: ReturnType<typeof useStyles>; active: boolean }) {
  const policies = useCountUp(84, active);
  const groups = useCountUp(23, active);
  const assigns = useCountUp(210, active);
  return (
    <div>
      <div className={styles.tiles}>
        {[
          { v: policies, l: "Policies", c: IRIS },
          { v: groups, l: "Groups", c: INCLUDE },
          { v: assigns, l: "Assignments", c: AMBER },
        ].map((t) => (
          <div key={t.l} className={mergeClasses(styles.tile, styles.row)}>
            <span className={styles.tileBar} style={{ background: t.c }} />
            <div className={styles.tileVal}>{t.v}</div>
            <div className={styles.tileLabel}>{t.l}</div>
          </div>
        ))}
      </div>
      {["Contoso-All-Devices", "Sales-Pilot", "Finance-Kiosks"].map((g, i) => (
        <div key={g} className={mergeClasses(styles.secBar, styles.row)} style={{ animationDelay: `${120 + i * 90}ms` }}>
          <span style={{ color: INCLUDE, fontFamily: FONT_MONO, fontSize: 11 }}>▸</span>
          <span className={styles.secName}>{g}</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "#7B8291" }}>{[18, 11, 7][i]} assignments</span>
        </div>
      ))}
      <div className={mergeClasses(styles.dlPill, styles.row)} style={{ animationDelay: "420ms" }}>↓ Download report.html</div>
    </div>
  );
}

const CMP_ROWS: [string, boolean, boolean][] = [
  ["Compliance - Win11 Baseline", true, true],
  ["App - Company Portal", true, true],
  ["Config - BitLocker", true, false],
  ["Script - Detect Legacy TLS", false, true],
  ["App - Edge (required)", true, true],
];

export default function DemoReel() {
  const styles = useStyles();
  const [scene, setScene] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 4200);
    return () => clearInterval(id);
  }, []);

  const s = SCENES[scene];

  return (
    <div className={styles.frame}>
      <div className={styles.bar}>
        <span className={styles.dot} style={{ background: "#FF5F57" }} />
        <span className={styles.dot} style={{ background: "#FEBC2E" }} />
        <span className={styles.dot} style={{ background: "#28C840" }} />
        <span className={styles.file}>{s.file}</span>
        <span className={styles.live}><span className={styles.liveDot} /> live demo</span>
      </div>

      <div className={styles.stage} key={scene}>
        {s.id === "matrix" && (
          <div className={styles.mtx}>
            <div className={styles.mtxHead} style={{ textAlign: "left" }}>Group</div>
            {COLS.map((c) => <div key={c} className={styles.mtxHead}>{c}</div>)}
            {GROUPS.map((g, r) => (
              <div key={g} style={{ display: "contents" }}>
                <div className={mergeClasses(styles.mtxRowHead, styles.row)} style={{ animationDelay: `${r * 70}ms` }}>{g}</div>
                {CELLS[r].map((v, c) => <Cell key={c} v={v} delay={r * 70 + c * 45} styles={styles} />)}
              </div>
            ))}
          </div>
        )}

        {s.id === "compliance" && (
          <div className={mergeClasses(styles.cmpWrap, styles.row)}>
            <div
              className={styles.donut}
              style={{ background: "conic-gradient(#3DDC97 0 78%, #FF6B7A 78% 92%, #FFB020 92% 100%)" }}
            >
              <div className={styles.donutHole}>
                <span className={styles.donutPct}>78%</span>
                <span className={styles.donutSub}>compliant</span>
              </div>
            </div>
            <div className={styles.legend}>
              {[
                { c: INCLUDE, l: "Compliant", p: "78%" },
                { c: EXCLUDE, l: "Not compliant", p: "14%" },
                { c: AMBER, l: "In grace period", p: "8%" },
              ].map((r, i) => (
                <div key={r.l} className={mergeClasses(styles.legRow, styles.row)} style={{ animationDelay: `${i * 90}ms` }}>
                  <span className={styles.legDot} style={{ background: r.c }} />
                  <span style={{ color: "#C6C9D6" }}>{r.l}</span>
                  <span className={styles.legPct}>{r.p}</span>
                </div>
              ))}
              <div className={styles.legRow} style={{ marginTop: 4 }}>
                <span />
                <span style={{ color: "#7B8291", fontSize: 11 }}>Top reason · Require BitLocker</span>
                <span className={styles.legPct} style={{ color: EXCLUDE }}>11</span>
              </div>
            </div>
          </div>
        )}

        {s.id === "report" && <ReportScene styles={styles} active />}

        {s.id === "compare" && (
          <div className={styles.cmpGrid}>
            <div className={styles.cmpHead}>Policy</div>
            <div className={mergeClasses(styles.cmpHead, styles.cmpHeadC)}>LAPTOP-4471</div>
            <div className={mergeClasses(styles.cmpHead, styles.cmpHeadC)}>KIOSK-02</div>
            {CMP_ROWS.map(([name, a, b], i) => (
              <div key={name} style={{ display: "contents" }}>
                <div className={mergeClasses(styles.cmpCell, styles.row)} style={{ animationDelay: `${i * 70}ms` }}>{name}</div>
                <div className={mergeClasses(styles.cmpMark, styles.row)} style={{ animationDelay: `${i * 70}ms`, color: a ? INCLUDE : "#39414F" }}>{a ? "✓" : "—"}</div>
                <div className={mergeClasses(styles.cmpMark, styles.row)} style={{ animationDelay: `${i * 70}ms`, color: b ? INCLUDE : EXCLUDE }}>{b ? "✓" : "✗"}</div>
              </div>
            ))}
          </div>
        )}

        {s.id === "tags" && (
          <div className={styles.tags}>
            {[
              { serial: "5CD1234ABC", tag: "Sales-Pilot", assigning: false },
              { serial: "5CD5678DEF", tag: "Default", assigning: false },
              { serial: "PF3ABCDEF9", tag: "Finance-Kiosks", assigning: true },
              { serial: "5CD9999AAA", tag: "Default", assigning: false },
            ].map((d, i) => (
              <div key={d.serial} className={mergeClasses(styles.tagRow, styles.row)} style={{ animationDelay: `${i * 80}ms` }}>
                <span className={styles.tagSerial}>{d.serial}</span>
                {d.assigning
                  ? <span className={styles.tagAssigning}><Spinner size="extra-tiny" /> assigning…</span>
                  : <span className={styles.tagPill}>{d.tag}</span>}
              </div>
            ))}
          </div>
        )}

        {s.id === "members" && (
          <div>
            <div className={mergeClasses(styles.memHead, styles.row)}>
              <span style={{ color: AMBER }}>◆</span>
              <span className={styles.memTitle}>Sales-Pilot</span>
              <span className={styles.memCount}>24 members</span>
            </div>
            {[
              { n: "Amelia Boonstra", i: "AB", c: "#8F86EE", tag: "added", tc: INCLUDE },
              { n: "Devin Okafor", i: "DO", c: "#3DDC97", tag: "", tc: "" },
              { n: "Priya Nair", i: "PN", c: "#FFB020", tag: "", tc: "" },
              { n: "Tom Vermeer", i: "TV", c: "#FF6B7A", tag: "removed", tc: EXCLUDE },
              { n: "Sofia Ali", i: "SA", c: "#4FC3F7", tag: "", tc: "" },
            ].map((m, i) => (
              <div key={m.n} className={mergeClasses(styles.memRow, styles.row)} style={{ animationDelay: `${i * 80}ms`, opacity: m.tag === "removed" ? 0.5 : undefined }}>
                <span className={styles.avatar} style={{ background: m.c }}>{m.i}</span>
                <span style={{ color: "#D2D6DF" }}>{m.n}</span>
                {m.tag && <span className={styles.tag} style={{ background: `${m.tc}22`, color: m.tc }}>{m.tag === "added" ? "+ added" : "− removed"}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.caption}>
        <span className={styles.capText}>{s.caption}</span>
        <div className={styles.scDots}>
          {SCENES.map((sc, i) => (
            <button
              key={sc.id}
              className={mergeClasses(styles.scDot, i === scene && styles.scDotActive)}
              onClick={() => setScene(i)}
              aria-label={`Show ${sc.id} demo`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
