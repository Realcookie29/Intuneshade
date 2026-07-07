import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button, Input, Textarea, Text, Spinner, Badge, TabList, Tab, Checkbox,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  makeStyles, tokens, mergeClasses,
} from "@fluentui/react-components";
import {
  TagRegular, ArrowSyncRegular, ArrowDownloadRegular, DocumentArrowUpRegular,
  SearchRegular, CheckmarkCircleFilled, DismissCircleFilled, SubtractCircleFilled,
  ClockRegular, DismissRegular, DataBarHorizontalRegular,
} from "@fluentui/react-icons";
import PageHeader from "../layout/PageHeader";
import {
  fetchAutopilotDevices, fetchAutopilotDevice, applyGroupTag, parseSerialsFromText, buildTagBackupCsv,
  type AutopilotDevice,
} from "../../services/autopilotService";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How many changed devices we verify one-by-one before just trusting the write. */
const VERIFY_CAP = 40;

interface ActionStatus {
  phase: "applying" | "verifying" | "done";
  action: "apply" | "remove";
  total: number;      // devices whose tag actually changes
  progress: number;   // count done in the current phase
  updated: number;
  unchanged: number;
  failed: number;
  confirmed: number;  // verified in Intune
  timedOut: boolean;  // verification didn't fully confirm in time
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  bar: {
    display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    padding: "12px 24px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  stat: { display: "flex", flexDirection: "column", marginRight: "6px" },
  statVal: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, lineHeight: "1" },
  statLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  content: { flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" },
  panel: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "1000px" },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  tagRow: { display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" },
  tagField: { display: "flex", flexDirection: "column", gap: "4px" },
  table: { borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: tokens.fontSizeBase300 },
  th: {
    position: "sticky", top: 0, textAlign: "left", padding: "8px 12px", zIndex: 1,
    background: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  td: { padding: "7px 12px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, verticalAlign: "middle" },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  tableWrap: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: "8px", overflow: "auto", maxHeight: "440px" },
  muted: { color: tokens.colorNeutralForeground3 },
  arrow: { color: tokens.colorNeutralForeground3, margin: "0 6px" },
  center: {
    height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: "14px", color: tokens.colorNeutralForeground3, textAlign: "center", padding: "48px",
  },
  resultRow: { display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" },
  chip: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: tokens.fontSizeBase300 },
  searchRow: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  selectBar: {
    display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap",
    padding: "12px 14px", borderRadius: "8px",
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  selectBarText: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1 },

  statusBar: {
    position: "fixed", right: "24px", bottom: "24px", zIndex: 1000,
    display: "flex", alignItems: "center", gap: "12px",
    minWidth: "300px", maxWidth: "420px", padding: "12px 14px",
    borderRadius: "12px", backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow16,
    animationName: { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "none" } },
    animationDuration: "0.22s", animationTimingFunction: "cubic-bezier(.2,.7,.2,1)",
  },
  statusAccent: { width: "3px", alignSelf: "stretch", borderRadius: "2px", flexShrink: 0 },
  statusIcon: { fontSize: "20px", flexShrink: 0, display: "flex" },
  statusBody: { display: "flex", flexDirection: "column", gap: "3px", flex: 1, minWidth: 0 },
  statusTitle: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  statusSub: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  statusMeter: { height: "4px", borderRadius: "2px", background: tokens.colorNeutralBackground4, overflow: "hidden", marginTop: "3px" },
  statusMeterFill: { height: "100%", borderRadius: "2px", transition: "width 0.3s ease" },

  dist: { display: "flex", flexDirection: "column", gap: "4px", maxWidth: "780px" },
  distRow: {
    display: "grid", gridTemplateColumns: "190px 1fr 52px", gap: "14px", alignItems: "center",
    padding: "8px 10px", borderRadius: "8px", border: "1px solid transparent", background: "transparent",
    cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit",
    ":hover": { backgroundColor: tokens.colorNeutralBackground2, border: `1px solid ${tokens.colorNeutralStroke2}` },
  },
  distLabel: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  distTrack: { height: "10px", borderRadius: "999px", backgroundColor: tokens.colorNeutralBackground4, overflow: "hidden" },
  distFill: { display: "block", height: "100%", borderRadius: "999px" },
  distCount: { textAlign: "right", fontFamily: tokens.fontFamilyMonospace, fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  filterChip: {
    display: "inline-flex", alignItems: "center", gap: "8px", padding: "4px 6px 4px 12px",
    borderRadius: "999px", backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
  },
});

type TabKey = "overview" | "csv" | "select";

export default function AutopilotGroupTagPage() {
  const styles = useStyles();
  const fileRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [devices, setDevices] = useState<AutopilotDevice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  // CSV / serial paste state
  const [rawText, setRawText] = useState("");
  const [csvTag, setCsvTag] = useState("");
  const [matched, setMatched] = useState<AutopilotDevice[] | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);

  // Select-devices state
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null); // exact tag ("" = untagged), null = all
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selTag, setSelTag] = useState("");

  // Apply state
  const [confirm, setConfirm] = useState<{ list: AutopilotDevice[]; tag: string } | null>(null);
  const [status, setStatus] = useState<ActionStatus | null>(null);
  // Devices currently being written/verified (id → target tag) show "assigning…"
  // instead of a value; ids in justConfirmed briefly show a checkmark.
  const [pending, setPending] = useState<Map<string, string>>(new Map());
  const [justConfirmed, setJustConfirmed] = useState<Set<string>>(new Set());
  const busy = status?.phase === "applying" || status?.phase === "verifying";

  const dismissStatus = () => { setStatus(null); setJustConfirmed(new Set()); };

  // Auto-dismiss the status bar a few seconds after a clean completion.
  useEffect(() => {
    if (status?.phase === "done" && status.failed === 0 && !status.timedOut) {
      const t = setTimeout(() => { setStatus(null); setJustConfirmed(new Set()); }, 6000);
      return () => clearTimeout(t);
    }
  }, [status]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setDevices(await fetchAutopilotDevices());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load Autopilot devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const bySerial = useMemo(() => {
    const m = new Map<string, AutopilotDevice>();
    for (const d of devices ?? []) m.set(d.serialNumber.toLowerCase(), d);
    return m;
  }, [devices]);

  const doMatch = () => {
    const serials = parseSerialsFromText(rawText);
    const found: AutopilotDevice[] = [];
    const missing: string[] = [];
    for (const s of serials) {
      const d = bySerial.get(s.toLowerCase());
      if (d) found.push(d); else missing.push(s);
    }
    setMatched(found);
    setNotFound(missing);
    setStatus(null);
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setRawText(await f.text());
  };

  // How many devices carry each group tag ("" = untagged), most-used first.
  const tagDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of devices ?? []) counts.set(d.groupTag || "", (counts.get(d.groupTag || "") ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [devices]);
  const maxTagCount = tagDistribution[0]?.count ?? 1;

  const filteredDevices = useMemo(() => {
    let list = devices ?? [];
    if (tagFilter !== null) list = list.filter((d) => (d.groupTag || "") === tagFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) =>
      [d.serialNumber, d.model, d.manufacturer, d.groupTag].some((v) => v.toLowerCase().includes(q))
    );
    return list;
  }, [devices, search, tagFilter]);

  const selectedDevices = useMemo(
    () => (devices ?? []).filter((d) => selected.has(d.id)),
    [devices, selected]
  );

  const runApply = async (list: AutopilotDevice[], tag: string) => {
    setConfirm(null);
    const action: ActionStatus["action"] = tag === "" ? "remove" : "apply";
    setStatus({ phase: "applying", action, total: list.length, progress: 0, updated: 0, unchanged: 0, failed: 0, confirmed: 0, timedOut: false });

    // 1. Write the changes.
    const res = await applyGroupTag(list, tag, (done) =>
      setStatus((s) => (s && s.phase === "applying" ? { ...s, progress: done } : s))
    );

    const changedIds = new Set(res.filter((r) => r.ok && r.from !== r.to).map((r) => r.id));
    const updated = changedIds.size;
    const unchanged = res.filter((r) => r.ok && r.from === r.to).length;
    const failed = res.filter((r) => !r.ok).length;

    setSelected(new Set());
    setMatched(null);

    // Mark changed devices as "assigning…" — do NOT reveal the new value yet.
    setPending((prev) => { const m = new Map(prev); for (const id of changedIds) m.set(id, tag); return m; });

    const changed = list.filter((d) => changedIds.has(d.id));

    // 2. Verify the change actually landed in Intune (eventually consistent).
    //    Skip per-device verification for very large batches — trust the write.
    if (updated === 0 || updated > VERIFY_CAP) {
      if (updated > 0) {
        setDevices((prev) => (prev ? prev.map((d) => (changedIds.has(d.id) ? { ...d, groupTag: tag } : d)) : prev));
        setPending((prev) => { const m = new Map(prev); for (const id of changedIds) m.delete(id); return m; });
      }
      setStatus({ phase: "done", action, total: updated, progress: updated, updated, unchanged, failed, confirmed: updated > VERIFY_CAP ? 0 : updated, timedOut: updated > VERIFY_CAP });
      return;
    }

    setStatus({ phase: "verifying", action, total: updated, progress: 0, updated, unchanged, failed, confirmed: 0, timedOut: false });
    const confirmed = new Set<string>();
    for (let cycle = 0; cycle < 10 && confirmed.size < changed.length; cycle++) {
      await sleep(3000);
      const stillChecking = changed.filter((d) => !confirmed.has(d.id));
      await Promise.all(stillChecking.map(async (d) => {
        try {
          const fresh = await fetchAutopilotDevice(d.id);
          if ((fresh.groupTag ?? "") === tag) {
            confirmed.add(d.id);
            // Confirmed in Intune: reveal the real value, drop pending, flag the checkmark.
            const val = fresh.groupTag ?? "";
            setDevices((prev) => (prev ? prev.map((x) => (x.id === d.id ? { ...x, groupTag: val } : x)) : prev));
            setPending((prev) => { const m = new Map(prev); m.delete(d.id); return m; });
            // Show a checkmark next to the real value, then fade it — the value stays.
            setJustConfirmed((prev) => new Set(prev).add(d.id));
            setTimeout(() => setJustConfirmed((prev) => {
              const n = new Set(prev); n.delete(d.id); return n;
            }), 2500);
          }
        } catch { /* keep polling next cycle */ }
      }));
      setStatus((s) => (s && s.phase === "verifying" ? { ...s, progress: confirmed.size } : s));
    }

    // Writes that returned 200 but weren't reflected in time: the change did
    // succeed, Intune's read is just lagging — reveal the value and clear pending.
    const stillPending = changed.filter((d) => !confirmed.has(d.id));
    if (stillPending.length) {
      const ids = new Set(stillPending.map((d) => d.id));
      setDevices((prev) => (prev ? prev.map((d) => (ids.has(d.id) ? { ...d, groupTag: tag } : d)) : prev));
      setPending((prev) => { const m = new Map(prev); for (const id of ids) m.delete(id); return m; });
    }

    setStatus({ phase: "done", action, total: updated, progress: confirmed.size, updated, unchanged, failed, confirmed: confirmed.size, timedOut: confirmed.size < changed.length });
  };

  const exportBackup = () => {
    if (!devices) return;
    const blob = new Blob([buildTagBackupCsv(devices)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autopilot-grouptags-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const willChange = (list: AutopilotDevice[], tag: string) => list.filter((d) => d.groupTag !== tag).length;

  // Current-tag cell: an action-specific "…ing" state while writing/verifying,
  // a brief checkmark on the freshly confirmed value, otherwise the plain tag.
  const renderCurrentTag = (d: AutopilotDevice) => {
    const target = pending.get(d.id);
    if (target !== undefined) {
      const verb = target === "" ? "Removing" : d.groupTag ? "Changing" : "Adding";
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: tokens.colorStatusWarningForeground1 }}>
          <Spinner size="extra-tiny" /> {verb}…
        </span>
      );
    }
    const ok = justConfirmed.has(d.id);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {ok && <CheckmarkCircleFilled style={{ color: tokens.colorPaletteGreenForeground1, fontSize: 16 }} />}
        {d.groupTag ? <Badge appearance="tint" color={ok ? "success" : undefined}>{d.groupTag}</Badge> : <span className={styles.muted}>—</span>}
      </span>
    );
  };

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Manage"
        title="Autopilot Group Tags"
        subtitle="Bulk-assign the Windows Autopilot Group Tag to devices — from a serial-number CSV, or by picking devices from the list."
        icon={<TagRegular />}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button icon={<ArrowDownloadRegular />} onClick={exportBackup} disabled={!devices?.length}>
              Export current tags
            </Button>
            <Button icon={loading ? <Spinner size="extra-tiny" /> : <ArrowSyncRegular />} onClick={() => void load()} disabled={loading}>
              Reload
            </Button>
          </div>
        }
      />

      {!loading && !loadError && devices && (
        <div className={styles.bar}>
          <div className={styles.stat}><span className={styles.statVal}>{devices.length}</span><span className={styles.statLabel}>Autopilot devices</span></div>
          <div className={styles.stat}><span className={styles.statVal}>{new Set(devices.map((d) => d.groupTag).filter(Boolean)).size}</span><span className={styles.statLabel}>Distinct tags</span></div>
          <div className={styles.stat}><span className={styles.statVal}>{devices.filter((d) => !d.groupTag).length}</span><span className={styles.statLabel}>Untagged</span></div>
          <div style={{ marginLeft: "auto" }}>
            <TabList selectedValue={tab} onTabSelect={(_, d) => { setTab(d.value as TabKey); setStatus(null); }}>
              <Tab value="overview" icon={<DataBarHorizontalRegular />}>Overview</Tab>
              <Tab value="csv" icon={<DocumentArrowUpRegular />}>From CSV / serials</Tab>
              <Tab value="select" icon={<SearchRegular />}>Select devices</Tab>
            </TabList>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.center}><Spinner size="large" /><Text>Loading Autopilot devices…</Text></div>
      ) : loadError ? (
        <div className={styles.center}>
          <DismissCircleFilled style={{ fontSize: 40, color: tokens.colorPaletteRedForeground1 }} />
          <Text weight="semibold">Couldn't load Autopilot devices</Text>
          <Text size={200} className={styles.muted}>{loadError}</Text>
          <Button appearance="primary" onClick={() => void load()}>Try again</Button>
        </div>
      ) : (
        <div className={styles.content}>
          {tab === "overview" ? (
            <div className={styles.panel}>
              <Text className={styles.label}>Devices per group tag ({devices?.length ?? 0} total)</Text>
              <div className={styles.dist}>
                {tagDistribution.map(({ tag, count }) => (
                  <button
                    key={tag || "__untagged"}
                    className={styles.distRow}
                    onClick={() => { setTagFilter(tag); setSearch(""); setSelected(new Set()); setTab("select"); }}
                    title="Show these devices"
                  >
                    <span className={styles.distLabel}>
                      {tag ? <Badge appearance="tint">{tag}</Badge> : <Text className={styles.muted}>— untagged</Text>}
                    </span>
                    <span className={styles.distTrack}>
                      <span
                        className={styles.distFill}
                        style={{
                          width: `${Math.max(3, (count / maxTagCount) * 100)}%`,
                          background: tag ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground3,
                        }}
                      />
                    </span>
                    <span className={styles.distCount}>{count}</span>
                  </button>
                ))}
              </div>
              <Text size={200} className={styles.muted}>Click a tag to view and manage those devices.</Text>
            </div>
          ) : tab === "csv" ? (
            <div className={styles.panel}>
              <Text className={styles.label}>Paste serial numbers (one per line) or upload the Intune Autopilot CSV</Text>
              <Textarea
                value={rawText}
                onChange={(_, d) => setRawText(d.value)}
                placeholder={"Device Serial Number,Windows Product ID,Hardware Hash,Group Tag,Assigned User\n5CD1234ABC,...\n— or just —\n5CD1234ABC\n5CD5678DEF"}
                rows={6}
                style={{ fontFamily: tokens.fontFamilyMonospace }}
              />
              <div className={styles.tagRow}>
                <Button icon={<DocumentArrowUpRegular />} onClick={() => fileRef.current?.click()}>Upload CSV</Button>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }}
                  onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                <div className={styles.tagField}>
                  <Text className={styles.label}>Group tag to apply</Text>
                  <Input value={csvTag} onChange={(_, d) => setCsvTag(d.value)} placeholder="e.g. Default" contentBefore={<TagRegular />} />
                </div>
                <Button appearance="secondary" onClick={() => setCsvTag("Default")}>Use “Default”</Button>
                <Button appearance="primary" onClick={doMatch} disabled={!rawText.trim()}>Match serials</Button>
              </div>

              {matched && (
                <>
                  <div className={styles.resultRow}>
                    <Badge appearance="tint" color="brand">{matched.length} matched</Badge>
                    <Badge appearance="tint" color="warning">{notFound.length} not found</Badge>
                    {csvTag.trim() && <Badge appearance="tint" color="success">{willChange(matched, csvTag.trim())} will change</Badge>}
                    <Button
                      appearance="primary" icon={<TagRegular />}
                      disabled={!csvTag.trim() || matched.length === 0 || busy}
                      onClick={() => setConfirm({ list: matched, tag: csvTag.trim() })}
                      style={{ marginLeft: "auto" }}
                    >
                      Apply “{csvTag.trim() || "…"}” to {matched.length} device{matched.length === 1 ? "" : "s"}
                    </Button>
                  </div>
                  {renderPreview(matched, csvTag.trim(), styles)}
                  {notFound.length > 0 && (
                    <Text size={200} className={styles.muted}>
                      Not found in Autopilot: {notFound.slice(0, 20).join(", ")}{notFound.length > 20 ? ` +${notFound.length - 20} more` : ""}
                    </Text>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className={styles.panel}>
              <div className={styles.searchRow}>
                <Input value={search} onChange={(_, d) => setSearch(d.value)} placeholder="Search serial, model, tag…" contentBefore={<SearchRegular />} style={{ minWidth: 260 }} />
                {tagFilter !== null && (
                  <span className={styles.filterChip}>
                    Tag: {tagFilter || "untagged"}
                    <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={() => setTagFilter(null)} aria-label="Clear tag filter" />
                  </span>
                )}
                <Text size={200} className={styles.muted}>
                  {selected.size} selected · {filteredDevices.length} shown
                </Text>
              </div>

              {selected.size > 0 && (
                <div className={styles.selectBar}>
                  <Text className={styles.selectBarText}>
                    {selected.size} device{selected.size === 1 ? "" : "s"} selected
                  </Text>
                  <Input
                    value={selTag}
                    onChange={(_, d) => setSelTag(d.value)}
                    placeholder="Group tag to apply…"
                    contentBefore={<TagRegular />}
                    input={{ ref: tagInputRef }}
                    style={{ minWidth: 200 }}
                  />
                  <Button appearance="secondary" onClick={() => setSelTag("Default")}>Use “Default”</Button>
                  <Button
                    appearance="primary" icon={<TagRegular />}
                    disabled={busy}
                    onClick={() => {
                      if (!selTag.trim()) { tagInputRef.current?.focus(); return; }
                      setConfirm({ list: selectedDevices, tag: selTag.trim() });
                    }}
                  >
                    {selectedDevices.some((d) => d.groupTag.trim() !== "") ? "Change group tag" : "Apply group tag"}
                  </Button>
                  <Button
                    appearance="secondary" icon={<SubtractCircleFilled />}
                    disabled={busy || !selectedDevices.some((d) => d.groupTag.trim() !== "")}
                    onClick={() => setConfirm({ list: selectedDevices, tag: "" })}
                  >
                    Remove tag
                  </Button>
                  <Button appearance="subtle" onClick={() => setSelected(new Set())}>Clear</Button>
                  {!selTag.trim() && <Text size={200} className={styles.muted}>← type a tag to change/apply</Text>}
                </div>
              )}

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th} style={{ width: 36 }}>
                        <Checkbox
                          checked={filteredDevices.length > 0 && filteredDevices.every((d) => selected.has(d.id))}
                          onChange={(_, d) => {
                            const next = new Set(selected);
                            if (d.checked) filteredDevices.forEach((x) => next.add(x.id));
                            else filteredDevices.forEach((x) => next.delete(x.id));
                            setSelected(next);
                          }}
                        />
                      </th>
                      <th className={styles.th}>Serial</th>
                      <th className={styles.th}>Model</th>
                      <th className={styles.th}>Manufacturer</th>
                      <th className={styles.th}>Current tag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDevices.map((d) => (
                      <tr key={d.id}>
                        <td className={styles.td}>
                          <Checkbox
                            checked={selected.has(d.id)}
                            onChange={(_, v) => {
                              const next = new Set(selected);
                              if (v.checked) next.add(d.id); else next.delete(d.id);
                              setSelected(next);
                            }}
                          />
                        </td>
                        <td className={mergeClasses(styles.td, styles.mono)}>{d.serialNumber || "—"}</td>
                        <td className={styles.td}>{d.model || "—"}</td>
                        <td className={styles.td}>{d.manufacturer || "—"}</td>
                        <td className={styles.td}>{renderCurrentTag(d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {status && <StatusBar status={status} styles={styles} onDismiss={dismissStatus} />}

      {confirm && (
        <Dialog open modalType="alert" onOpenChange={(_, d) => { if (!d.open) setConfirm(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>{confirm.tag === "" ? "Remove group tag?" : "Apply group tag?"}</DialogTitle>
              <DialogContent>
                {confirm.tag === "" ? (
                  <>
                    Clear the Group Tag from <b>{confirm.list.length}</b> device
                    {confirm.list.length === 1 ? "" : "s"}. {willChange(confirm.list, "")} currently
                    {willChange(confirm.list, "") === 1 ? " has" : " have"} a tag and will be emptied;
                    the rest are already untagged. This writes to your tenant.
                  </>
                ) : (
                  <>
                    Set the Group Tag to <b>“{confirm.tag}”</b> on <b>{confirm.list.length}</b> device
                    {confirm.list.length === 1 ? "" : "s"}. {willChange(confirm.list, confirm.tag)} will actually
                    change; the rest already have this tag. This writes to your tenant.
                  </>
                )}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button appearance="primary" onClick={() => void runApply(confirm.list, confirm.tag)}>
                  {confirm.tag === "" ? "Remove tag" : "Apply tag"}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}

function StatusBar({ status, styles, onDismiss }: { status: ActionStatus; styles: ReturnType<typeof useStyles>; onDismiss: () => void }) {
  let accent = tokens.colorBrandForeground1;
  let icon: React.ReactNode = <Spinner size="tiny" />;
  let title = "";
  let sub = "";
  let showMeter = false;

  if (status.phase === "applying") {
    title = status.action === "remove" ? "Removing group tag…" : "Applying group tag…";
    sub = `Writing changes… ${status.progress}/${status.total}`;
    showMeter = true;
  } else if (status.phase === "verifying") {
    title = "Confirming in Intune…";
    sub = `${status.progress}/${status.total} confirmed`;
    showMeter = true;
  } else if (status.failed > 0) {
    accent = tokens.colorPaletteRedForeground1;
    icon = <DismissCircleFilled style={{ color: accent }} />;
    title = "Completed with errors";
    sub = `${status.updated} updated · ${status.failed} failed${status.unchanged ? ` · ${status.unchanged} unchanged` : ""}`;
  } else if (status.timedOut) {
    accent = tokens.colorStatusWarningForeground1;
    icon = <ClockRegular style={{ color: accent }} />;
    title = status.action === "remove" ? "Removed — Intune is catching up" : "Applied — Intune is catching up";
    sub = status.confirmed > 0
      ? `${status.confirmed}/${status.total} confirmed so far. Reload later to check the rest.`
      : `${status.updated} device${status.updated === 1 ? "" : "s"} written. Use Reload to verify.`;
  } else {
    accent = tokens.colorPaletteGreenForeground1;
    icon = <CheckmarkCircleFilled style={{ color: accent }} />;
    title = "Completed";
    sub = `${status.updated} device${status.updated === 1 ? "" : "s"} ${status.action === "remove" ? "cleared" : "tagged"}${status.unchanged ? ` · ${status.unchanged} already set` : ""}`;
  }

  const pct = status.total ? Math.round((status.progress / status.total) * 100) : 0;

  return (
    <div className={styles.statusBar} role="status">
      <span className={styles.statusAccent} style={{ background: accent }} />
      <span className={styles.statusIcon}>{icon}</span>
      <div className={styles.statusBody}>
        <span className={styles.statusTitle}>{title}</span>
        <span className={styles.statusSub}>{sub}</span>
        {showMeter && (
          <div className={styles.statusMeter}>
            <div className={styles.statusMeterFill} style={{ width: `${pct}%`, background: accent }} />
          </div>
        )}
      </div>
      {status.phase === "done" && (
        <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={onDismiss} aria-label="Dismiss" />
      )}
    </div>
  );
}

function renderPreview(list: AutopilotDevice[], tag: string, styles: ReturnType<typeof useStyles>) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Serial</th>
            <th className={styles.th}>Model</th>
            <th className={styles.th}>Current tag</th>
            <th className={styles.th}>New tag</th>
            <th className={styles.th}>Change</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 500).map((d) => {
            const change = tag && d.groupTag !== tag;
            return (
              <tr key={d.id}>
                <td className={mergeClasses(styles.td, styles.mono)}>{d.serialNumber || "—"}</td>
                <td className={styles.td}>{d.model || "—"}</td>
                <td className={styles.td}>{d.groupTag ? <Badge appearance="tint">{d.groupTag}</Badge> : <span className={styles.muted}>—</span>}</td>
                <td className={styles.td}>{tag ? <Badge appearance="tint" color="brand">{tag}</Badge> : <span className={styles.muted}>—</span>}</td>
                <td className={styles.td}>
                  {!tag ? <span className={styles.muted}>—</span>
                    : change ? <Badge appearance="tint" color="success">will change</Badge>
                    : <span className={styles.muted}>no change</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
