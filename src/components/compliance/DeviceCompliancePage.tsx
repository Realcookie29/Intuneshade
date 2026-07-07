import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Button, Input, Text, Spinner, Badge, makeStyles, tokens, mergeClasses,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from "@fluentui/react-components";
import {
  ShieldCheckmarkRegular, ArrowSyncRegular, SearchRegular, DismissCircleFilled, ArrowDownloadRegular,
} from "@fluentui/react-icons";
import PageHeader from "../layout/PageHeader";
import {
  fetchManagedDevices, fetchComplianceReasons, fetchDeviceComplianceDetail,
  BUCKET_LABEL, BUCKET_COLOR, type ComplianceBucket, type ManagedDeviceLite,
  type ComplianceReason, type DeviceComplianceDetail,
} from "../../services/deviceComplianceService";
import { buildComplianceReportHtml, downloadComplianceReport } from "../../services/deviceComplianceReportService";

const BUCKET_ORDER: ComplianceBucket[] = ["compliant", "noncompliant", "inGracePeriod", "error", "conflict", "unknown"];

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  content: { flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "22px" },
  top: { display: "flex", gap: "32px", flexWrap: "wrap", alignItems: "center" },
  donutWrap: { position: "relative", width: "184px", height: "184px", flexShrink: 0 },
  donut: { width: "184px", height: "184px", borderRadius: "50%" },
  donutHole: {
    position: "absolute", inset: "26px", borderRadius: "50%", backgroundColor: tokens.colorNeutralBackground1,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px",
  },
  donutPct: { fontFamily: tokens.fontFamilyNumeric, fontSize: "34px", fontWeight: tokens.fontWeightSemibold, lineHeight: "1" },
  donutLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  legend: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "280px" },
  legendRow: {
    display: "grid", gridTemplateColumns: "14px 1fr auto auto", gap: "10px", alignItems: "center",
    padding: "7px 10px", borderRadius: "8px", border: "1px solid transparent", background: "transparent",
    cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit", color: tokens.colorNeutralForeground1,
    ":hover": { backgroundColor: tokens.colorNeutralBackground2, border: `1px solid ${tokens.colorNeutralStroke2}` },
  },
  legendRowActive: { backgroundColor: tokens.colorNeutralBackground2, border: `1px solid ${tokens.colorNeutralStroke1}` },
  dot: { width: "12px", height: "12px", borderRadius: "3px" },
  legendCount: { fontFamily: tokens.fontFamilyNumeric, fontWeight: tokens.fontWeightSemibold },
  legendPct: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, minWidth: "44px", textAlign: "right" },

  section: { display: "flex", flexDirection: "column", gap: "10px" },
  sectionTitle: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  reason: { display: "grid", gridTemplateColumns: "minmax(220px, 340px) 1fr 120px", gap: "14px", alignItems: "center", padding: "3px 0" },
  reasonName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: tokens.fontSizeBase300 },
  track: { height: "10px", borderRadius: "999px", backgroundColor: tokens.colorNeutralBackground4, overflow: "hidden" },
  fill: { display: "block", height: "100%", borderRadius: "999px", backgroundColor: BUCKET_COLOR.noncompliant },
  reasonNum: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, textAlign: "right" },

  toolbar: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3 },
  tableWrap: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: "8px", overflow: "auto", maxHeight: "460px" },
  table: { borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: tokens.fontSizeBase300 },
  th: {
    position: "sticky", top: 0, textAlign: "left", padding: "8px 12px", zIndex: 1,
    background: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase",
    letterSpacing: "0.03em", borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  td: { padding: "7px 12px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, verticalAlign: "middle" },
  rowBtn: { cursor: "pointer", ":hover": { backgroundColor: tokens.colorNeutralBackground2 } },
  center: {
    height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "14px", color: tokens.colorNeutralForeground3, textAlign: "center", padding: "48px",
  },
  detailRow: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  platforms: { display: "inline-flex", border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: "8px", overflow: "hidden" },
  platBtn: {
    border: "none", background: "transparent", color: tokens.colorNeutralForeground2, cursor: "pointer",
    padding: "5px 12px", fontSize: tokens.fontSizeBase200, fontFamily: "inherit",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    ":hover": { backgroundColor: tokens.colorNeutralBackground2 },
  },
  platBtnActive: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
});

const STATE_COLOR: Record<string, string> = {
  compliant: BUCKET_COLOR.compliant,
  noncompliant: BUCKET_COLOR.noncompliant,
  error: BUCKET_COLOR.error,
  conflict: BUCKET_COLOR.conflict,
  inGracePeriod: BUCKET_COLOR.inGracePeriod,
};

function stateBadge(state: string) {
  const color = STATE_COLOR[state] ?? BUCKET_COLOR.unknown;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
    <span style={{ fontSize: 13 }}>{state}</span>
  </span>;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function DeviceCompliancePage() {
  const styles = useStyles();
  const { accounts } = useMsal();
  const account = accounts[0];
  const [devices, setDevices] = useState<ManagedDeviceLite[] | null>(null);
  const [reasons, setReasons] = useState<ComplianceReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<ComplianceBucket | "all">("noncompliant");
  const [platform, setPlatform] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [detailFor, setDetailFor] = useState<ManagedDeviceLite | null>(null);
  const [detail, setDetail] = useState<DeviceComplianceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [devs, rs] = await Promise.all([fetchManagedDevices(), fetchComplianceReasons().catch(() => [])]);
      setDevices(devs);
      setReasons(rs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load device compliance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => {
    const c: Record<ComplianceBucket, number> = { compliant: 0, noncompliant: 0, inGracePeriod: 0, error: 0, conflict: 0, unknown: 0 };
    for (const d of devices ?? []) c[d.bucket]++;
    return c;
  }, [devices]);

  const total = devices?.length ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const donutGradient = useMemo(() => {
    if (!total) return tokens.colorNeutralBackground4;
    let acc = 0;
    const stops: string[] = [];
    for (const b of BUCKET_ORDER) {
      const n = counts[b];
      if (!n) continue;
      const start = (acc / total) * 100;
      acc += n;
      const end = (acc / total) * 100;
      stops.push(`${BUCKET_COLOR[b]} ${start}% ${end}%`);
    }
    return `conic-gradient(${stops.join(", ")})`;
  }, [counts, total]);

  // Distinct platforms present (iOS / Android / macOS / Windows / Linux …).
  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const d of devices ?? []) if (d.operatingSystem) set.add(d.operatingSystem);
    return [...set].sort();
  }, [devices]);

  const filtered = useMemo(() => {
    let list = devices ?? [];
    if (filter !== "all") list = list.filter((d) => d.bucket === filter);
    if (platform !== "all") list = list.filter((d) => d.operatingSystem === platform);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) =>
      [d.deviceName, d.userPrincipalName, d.operatingSystem, d.model].some((v) => v.toLowerCase().includes(q))
    );
    return list;
  }, [devices, filter, platform, search]);

  const nonCompliantTotal = counts.noncompliant + counts.error + counts.conflict;

  const maxReason = reasons[0]?.nonCompliant ?? 1;

  const downloadReport = () => {
    if (!devices) return;
    const html = buildComplianceReportHtml(devices, reasons, {
      tenantName: account?.name ? account.name : account?.username?.split("@")[1] ?? "Unknown tenant",
      generatedBy: account?.username ?? account?.name ?? "Unknown",
      generatedAt: new Date().toLocaleString(),
    });
    downloadComplianceReport(html, account?.name ?? "tenant", new Date().toISOString().slice(0, 10));
  };

  const openDetail = async (d: ManagedDeviceLite) => {
    setDetailFor(d);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchDeviceComplianceDetail(d.id));
    } catch {
      setDetail({ policies: [], failingSettings: [] });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Insights"
        title="Device Compliance"
        subtitle="How many devices are compliant, why the rest aren't, and exactly which devices need attention."
        icon={<ShieldCheckmarkRegular />}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button icon={<ArrowDownloadRegular />} onClick={downloadReport} disabled={loading || !devices?.length}>
              Download report
            </Button>
            <Button icon={loading ? <Spinner size="extra-tiny" /> : <ArrowSyncRegular />} onClick={() => void load()} disabled={loading}>
              Reload
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className={styles.center}><Spinner size="large" /><Text>Loading device compliance…</Text></div>
      ) : error ? (
        <div className={styles.center}>
          <DismissCircleFilled style={{ fontSize: 40, color: BUCKET_COLOR.noncompliant }} />
          <Text weight="semibold">Couldn't load compliance data</Text>
          <Text size={200} className={styles.muted}>{error}</Text>
          <Button appearance="primary" onClick={() => void load()}>Try again</Button>
        </div>
      ) : (
        <div className={styles.content}>
          {/* Overview: donut + clickable legend */}
          <div className={styles.top}>
            <div className={styles.donutWrap}>
              <div className={styles.donut} style={{ background: donutGradient }} />
              <div className={styles.donutHole}>
                <span className={styles.donutPct} style={{ color: BUCKET_COLOR.compliant }}>{pct(counts.compliant)}%</span>
                <span className={styles.donutLabel}>compliant</span>
              </div>
            </div>
            <div className={styles.legend}>
              {BUCKET_ORDER.map((b) => (
                <button
                  key={b}
                  className={mergeClasses(styles.legendRow, filter === b && styles.legendRowActive)}
                  onClick={() => setFilter(b)}
                  title={`Show ${BUCKET_LABEL[b].toLowerCase()} devices`}
                >
                  <span className={styles.dot} style={{ background: BUCKET_COLOR[b] }} />
                  <span>{BUCKET_LABEL[b]}</span>
                  <span className={styles.legendCount}>{counts[b]}</span>
                  <span className={styles.legendPct}>{pct(counts[b])}%</span>
                </button>
              ))}
              <Text size={200} className={styles.muted} style={{ padding: "6px 10px 0" }}>
                {total} managed devices · click a state to list those devices below.
              </Text>
            </div>
          </div>

          {/* Reasons — only when devices are actually failing */}
          {nonCompliantTotal > 0 && reasons.length > 0 && (
            <div className={styles.section}>
              <Text className={styles.sectionTitle}>Top non-compliance reasons</Text>
              {reasons.slice(0, 12).map((r) => (
                <div key={r.settingName} className={styles.reason}>
                  <span className={styles.reasonName} title={r.settingName}>{r.settingName}</span>
                  <span className={styles.track}>
                    <span className={styles.fill} style={{ width: `${Math.max(3, (r.nonCompliant / maxReason) * 100)}%` }} />
                  </span>
                  <span className={styles.reasonNum}>{r.nonCompliant} device{r.nonCompliant === 1 ? "" : "s"} · {pct(r.nonCompliant)}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Device list */}
          <div className={styles.section}>
            <div className={styles.toolbar}>
              <Text className={styles.sectionTitle}>
                {filter === "all" ? "All devices" : BUCKET_LABEL[filter]}
              </Text>
              <Badge appearance="tint">{filtered.length}</Badge>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {platforms.length > 1 && (
                  <div className={styles.platforms}>
                    <button className={mergeClasses(styles.platBtn, platform === "all" && styles.platBtnActive)} onClick={() => setPlatform("all")}>All</button>
                    {platforms.map((p) => (
                      <button key={p} className={mergeClasses(styles.platBtn, platform === p && styles.platBtnActive)} onClick={() => setPlatform(p)}>{p}</button>
                    ))}
                  </div>
                )}
                {filter !== "all" && <Button size="small" appearance="subtle" onClick={() => setFilter("all")}>Show all</Button>}
                <Input size="small" value={search} onChange={(_, d) => setSearch(d.value)} placeholder="Search device, user, OS…" contentBefore={<SearchRegular />} style={{ minWidth: 220 }} />
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Device</th>
                    <th className={styles.th}>User</th>
                    <th className={styles.th}>OS</th>
                    <th className={styles.th}>State</th>
                    <th className={styles.th}>Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 1000).map((d) => (
                    <tr key={d.id} className={mergeClasses(styles.td, styles.rowBtn)} onClick={() => void openDetail(d)}>
                      <td className={styles.td}>{d.deviceName}</td>
                      <td className={styles.td}>{d.userPrincipalName || "—"}</td>
                      <td className={styles.td}>{d.operatingSystem} {d.osVersion}</td>
                      <td className={styles.td}>{stateBadge(d.complianceState)}</td>
                      <td className={styles.td}>{fmtDate(d.lastSyncDateTime)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td className={styles.td} colSpan={5}><span className={styles.muted}>No devices in this state.</span></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Per-device detail */}
      {detailFor && (
        <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) setDetailFor(null); }}>
          <DialogSurface style={{ maxWidth: 560 }}>
            <DialogBody>
              <DialogTitle>{detailFor.deviceName} — {stateBadge(detailFor.complianceState)}</DialogTitle>
              <DialogContent>
                {detailLoading ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 0" }}><Spinner size="tiny" /> Loading compliance detail…</div>
                ) : detail ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <Text weight="semibold">Compliance policies</Text>
                      {detail.policies.length === 0 ? (
                        <Text size={200} className={styles.muted}> — none applied.</Text>
                      ) : detail.policies.map((p) => (
                        <div key={p.id} className={styles.detailRow}>
                          <span style={{ flex: 1 }}>{p.policyName}</span>
                          {stateBadge(p.state)}
                        </div>
                      ))}
                    </div>
                    {detail.failingSettings.length > 0 && (
                      <div>
                        <Text weight="semibold">Failing settings</Text>
                        {detail.failingSettings.map((s, i) => (
                          <div key={`${s.setting}-${i}`} className={styles.detailRow}>
                            <span style={{ flex: 1 }}>{s.setting}</span>
                            {stateBadge(s.state)}
                          </div>
                        ))}
                      </div>
                    )}
                    {detail.policies.length > 0 && detail.failingSettings.length === 0 && detailFor.bucket !== "compliant" && (
                      <Text size={200} className={styles.muted}>No specific failing settings were reported for this device.</Text>
                    )}
                  </div>
                ) : null}
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={() => setDetailFor(null)}>Close</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}
