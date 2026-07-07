import { useState, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Button, Text, Input, Radio, RadioGroup, Switch, Spinner, makeStyles, mergeClasses,
} from "@fluentui/react-components";
import {
  ArrowLeftRegular, DocumentArrowUpRegular, ArrowDownloadRegular, OpenRegular, DismissRegular,
  LinkRegular,
} from "@fluentui/react-icons";
import { loginRequest } from "../../auth/msalConfig";
import { LogoMark } from "../layout/Logo";
import { parseFilesToRecords, type ParseResult } from "../../services/offlineImportService";
import { SAMPLE_EXPORT_JSON } from "../../services/sampleExport";
import {
  buildReportHtml, downloadReportHtml, type ReportGrouping, type ReportOptions,
} from "../../services/assignmentReportService";

const C = {
  bg: "#FAF9F6", ink: "#201D19", ink2: "#57524B", ink3: "#8A847A",
  line: "#E6E1D8", amber: "#B26A00", amberSoft: "#F6EDDC", surface: "#FFFFFF", include: "#1F8F63",
};
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const useStyles = makeStyles({
  page: { height: "100vh", display: "flex", flexDirection: "column", background: C.bg, color: C.ink },
  header: {
    height: "64px", flexShrink: 0, borderBottom: `1px solid ${C.line}`, background: C.surface,
    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
  },
  hLeft: { display: "flex", alignItems: "center", gap: "14px" },
  brand: { display: "flex", alignItems: "center", gap: "9px" },
  brandName: { fontWeight: 600, fontSize: "15px" },
  offlineTag: { fontFamily: MONO, fontSize: "11px", color: C.amber, border: `1px solid ${C.amberSoft}`, background: C.amberSoft, borderRadius: "999px", padding: "3px 10px" },
  body: { flex: 1, minHeight: 0, display: "flex" },

  // Upload state
  uploadWrap: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", overflowY: "auto" },
  drop: {
    width: "100%", maxWidth: "620px", border: `1.5px dashed ${C.line}`, borderRadius: "16px",
    background: C.surface, padding: "48px 40px", textAlign: "center",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "14px",
    transition: "border-color .15s, background .15s",
  },
  dropActive: { border: `1.5px dashed ${C.amber}`, background: C.amberSoft },
  dropIcon: { fontSize: "40px", color: C.amber },
  dropTitle: { fontSize: "20px", fontWeight: 600 },
  dropText: { color: C.ink2, fontSize: "14.5px", lineHeight: "1.6", maxWidth: "440px" },
  hint: { color: C.ink3, fontSize: "12.5px", lineHeight: "1.55", maxWidth: "440px", marginTop: "4px" },
  errors: { color: "#B4402E", fontSize: "13px", marginTop: "8px", fontFamily: MONO, maxWidth: "460px", lineHeight: "1.5" },
  uploadCol: { width: "100%", maxWidth: "620px", display: "flex", flexDirection: "column", gap: "18px" },
  orDivider: { display: "flex", alignItems: "center", gap: "12px", width: "100%", maxWidth: "360px", color: C.ink3, fontSize: "12px", fontFamily: MONO },
  orLine: { flex: 1, height: "1px", background: C.line },
  urlRow: { display: "flex", gap: "8px", width: "100%", maxWidth: "460px" },
  sources: {
    background: C.surface, border: `1px solid ${C.line}`, borderRadius: "14px", padding: "22px 24px",
  },
  sourcesTitle: { fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink3, marginBottom: "14px" },
  sourceRow: { display: "flex", gap: "12px", padding: "10px 0", borderTop: `1px solid ${C.line}` },
  sourceNum: { fontFamily: MONO, fontSize: "12px", color: C.amber, flexShrink: 0, width: "18px" },
  sourceName: { fontSize: "14px", fontWeight: 600, color: C.ink },
  sourceDesc: { fontSize: "13px", color: C.ink2, lineHeight: "1.5", marginTop: "2px" },
  code: {
    fontFamily: MONO, fontSize: "12px", color: C.ink, background: C.bg, border: `1px solid ${C.line}`,
    borderRadius: "6px", padding: "6px 9px", marginTop: "6px", display: "block", overflowX: "auto", whiteSpace: "nowrap",
  },

  // Loaded state
  panel: {
    width: "300px", flexShrink: 0, borderRight: `1px solid ${C.line}`, background: C.surface,
    padding: "22px", display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto",
  },
  sectionLabel: { fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink3 },
  tiles: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  tile: { border: `1px solid ${C.line}`, borderRadius: "10px", padding: "12px 14px", background: C.bg },
  tileVal: { fontFamily: MONO, fontSize: "22px", fontWeight: 700, lineHeight: 1, color: C.ink },
  tileLabel: { fontSize: "11px", color: C.ink3, marginTop: "5px", textTransform: "uppercase", letterSpacing: "0.04em" },
  group: { display: "flex", flexDirection: "column", gap: "8px" },
  noteBox: { fontSize: "12px", color: C.ink2, lineHeight: "1.5", background: C.amberSoft, border: `1px solid ${C.line}`, borderRadius: "8px", padding: "10px 12px" },
  preview: { flex: 1, minWidth: 0, background: "#0B0D13" },
  frame: { width: "100%", height: "100%", border: "none", display: "block" },
  actions: { display: "flex", gap: "8px", flexWrap: "wrap" },
});

type Grouping = ReportGrouping;

/**
 * Fetch a link as one or more JSON files. A direct file URL yields one file.
 * An Azure Blob *container* URL (a list SAS, `sr=c`) is expanded the way the
 * Azure portal does: list the container, then download every `.json` blob —
 * so a shared baseline container works, not just single files.
 */
async function fetchUrlAsFiles(rawUrl: string): Promise<{ name: string; text: string }[]> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error(`${rawUrl}: not a valid URL`); }

  const isBlob = u.hostname.endsWith(".blob.core.windows.net");
  const isContainer =
    isBlob && u.searchParams.get("sr") !== "b" && !u.pathname.toLowerCase().endsWith(".json");

  if (isContainer) {
    const listUrl = new URL(rawUrl);
    listUrl.searchParams.set("restype", "container");
    listUrl.searchParams.set("comp", "list");
    const res = await fetch(listUrl.toString());
    if (!res.ok) throw new Error(`Container list failed (HTTP ${res.status}) — the SAS needs list permission (sp=rl).`);
    const xml = await res.text();
    const names = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)]
      .map((m) => m[1])
      .filter((n) => n.toLowerCase().endsWith(".json"))
      .slice(0, 300);
    if (names.length === 0) throw new Error("No .json files found in that container.");
    const base = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    const sas = u.search; // reuse the container SAS for each blob
    const out: { name: string; text: string }[] = [];
    for (const n of names) {
      const blobUrl = `${base}/${n.split("/").map(encodeURIComponent).join("/")}${sas}`;
      const r = await fetch(blobUrl);
      if (r.ok) out.push({ name: n, text: await r.text() });
    }
    return out;
  }

  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error(`${rawUrl}: HTTP ${res.status}`);
  return [{ name: u.pathname.split("/").pop() || rawUrl, text: await res.text() }];
}

export default function JsonExplorerPage({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const { instance } = useMsal();
  const inputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<ParseResult | null>(null);
  const [html, setHtml] = useState("");
  const [dragging, setDragging] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [loadingUrl, setLoadingUrl] = useState(false);

  const [grouping, setGrouping] = useState<Grouping>("group");
  const [includeVirtual, setIncludeVirtual] = useState(true);
  const [includeExclusions, setIncludeExclusions] = useState(true);
  const [includeFilters, setIncludeFilters] = useState(true);

  const options = (over?: Partial<ReportOptions>): ReportOptions => ({
    grouping, includeVirtual, includeExclusions, includeFilters, ...over,
  });

  const regenerate = (res: ParseResult, opts: ReportOptions) => {
    setHtml(buildReportHtml(res.records, opts, {
      tenantName: "Imported policies",
      generatedBy: "Offline JSON explorer",
      generatedAt: new Date().toLocaleString(),
    }));
  };

  const showResult = (res: ParseResult, extraErrors: string[] = []) => {
    if (res.records.length === 0) {
      // Stay on the upload screen with a clear reason rather than an empty report.
      setParseErrors([
        ...extraErrors,
        ...res.errors,
        res.policyCount > 0
          ? `Loaded ${res.policyCount} ${res.policyCount === 1 ? "policy" : "policies"}, but none contain assignments. Settings-only exports — like security baselines or older backups — don't include them. Use an export made with $expand=assignments.`
          : "No assignments found. Load an export that contains an 'assignments' array.",
      ]);
      return;
    }
    setParseErrors([...extraErrors, ...res.errors]);
    setResult(res);
    regenerate(res, options());
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = await Promise.all(
      Array.from(fileList).map(async (f) => ({ name: f.name, text: await f.text() }))
    );
    showResult(parseFilesToRecords(files));
  };

  const loadFromUrl = async () => {
    const urls = url.split(/[\s,]+/).map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setLoadingUrl(true);
    setParseErrors([]);
    const files: { name: string; text: string }[] = [];
    const errs: string[] = [];
    for (const u of urls) {
      try {
        const got = await fetchUrlAsFiles(u);
        if (got.length === 0) errs.push(`Nothing to load from ${u}`);
        files.push(...got);
      } catch (e) {
        // fetch() rejects with a TypeError when the browser blocks it (CORS).
        errs.push(
          e instanceof TypeError
            ? `Could not fetch ${u} — blocked by the browser (CORS) or unreachable. The storage account or host must allow this site's origin.`
            : e instanceof Error ? e.message : `Could not fetch ${u}`
        );
      }
    }
    setLoadingUrl(false);
    if (files.length === 0) { setParseErrors(errs); return; }
    showResult(parseFilesToRecords(files), errs);
  };

  const loadSample = () => showResult(parseFilesToRecords([{ name: "sample.json", text: SAMPLE_EXPORT_JSON }]));

  const applyOption = <T,>(setter: (v: T) => void, value: T, patch: Partial<ReportOptions>) => {
    setter(value);
    if (result) regenerate(result, options(patch));
  };

  const clear = () => { setResult(null); setHtml(""); setParseErrors([]); };
  const signIn = () => instance.loginRedirect(loginRequest);
  const dateStamp = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.hLeft}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button>
          <div className={styles.brand}>
            <LogoMark size={26} />
            <span className={styles.brandName}>JSON Explorer</span>
          </div>
          <span className={styles.offlineTag}>offline · no sign-in</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {result && <Button appearance="subtle" icon={<DismissRegular />} onClick={clear}>Clear</Button>}
          <Button appearance="primary" onClick={signIn}>Sign in for live data</Button>
        </div>
      </header>

      <input
        ref={inputRef} type="file" accept=".json,application/json" multiple
        style={{ display: "none" }}
        onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
      />

      {!result ? (
        <div className={styles.uploadWrap}>
          <div className={styles.uploadCol}>
            <div
              className={mergeClasses(styles.drop, dragging && styles.dropActive)}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
            >
              <DocumentArrowUpRegular className={styles.dropIcon} />
              <Text className={styles.dropTitle}>Drop exported Intune JSON here</Text>
              <Text className={styles.dropText}>
                Bring policies exported from Microsoft Graph, a community tool, or this app's
                Backup — anything with an <code>assignments</code> array — and get a full
                assignment report. Everything is parsed in your browser; nothing is uploaded.
              </Text>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <Button appearance="primary" icon={<DocumentArrowUpRegular />} onClick={() => inputRef.current?.click()}>
                  Choose JSON files
                </Button>
                <Button appearance="secondary" onClick={loadSample}>Load sample data</Button>
              </div>

              <div className={styles.orDivider}><span className={styles.orLine} />or paste a link<span className={styles.orLine} /></div>
              <div className={styles.urlRow}>
                <Input
                  style={{ flex: 1 }}
                  placeholder="Paste a .json link or an Azure Blob container URL"
                  value={url}
                  onChange={(_, d) => setUrl(d.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void loadFromUrl(); }}
                  contentBefore={<LinkRegular />}
                />
                <Button
                  appearance="secondary"
                  disabled={!url.trim() || loadingUrl}
                  icon={loadingUrl ? <Spinner size="extra-tiny" /> : undefined}
                  onClick={() => void loadFromUrl()}
                >
                  Load
                </Button>
              </div>

              {parseErrors.length > 0 && (
                <div className={styles.errors}>{parseErrors.join(" · ")}</div>
              )}
            </div>

            <div className={styles.sources}>
              <div className={styles.sourcesTitle}>No export yet? Here's how to get the JSON</div>
              <div className={styles.sourceRow}>
                <span className={styles.sourceNum}>→</span>
                <div>
                  <div className={styles.sourceName}>Just sign in (easiest)</div>
                  <div className={styles.sourceDesc}>One click, live tenant data, no export needed — the recommended path. Use JSON mode only when you can't or don't want to sign in.</div>
                </div>
              </div>
              <div className={styles.sourceRow}>
                <span className={styles.sourceNum}>→</span>
                <div>
                  <div className={styles.sourceName}>Microsoft Graph Explorer — best for a whole tenant</div>
                  <div className={styles.sourceDesc}>Run this per policy type, save each response, and drop them here together:</div>
                  <code className={styles.code}>GET /beta/deviceManagement/deviceConfigurations?$expand=assignments</code>
                  <div className={styles.sourceDesc} style={{ marginTop: 6 }}>Add group names (drop this file in too):</div>
                  <code className={styles.code}>GET /beta/groups?$select=id,displayName</code>
                </div>
              </div>
              <div className={styles.sourceRow}>
                <span className={styles.sourceNum}>→</span>
                <div>
                  <div className={styles.sourceName}>Browser DevTools — for a single policy, no Graph needed</div>
                  <div className={styles.sourceDesc}>
                    In the Intune portal, press <b>F12</b> → <b>Network</b>, open a policy, and save the
                    response that ends in <code>?$expand=assignments</code> as a <code>.json</code> file.
                  </div>
                </div>
              </div>
              <div className={styles.sourceRow}>
                <span className={styles.sourceNum}>→</span>
                <div>
                  <div className={styles.sourceName}>A community export tool</div>
                  <div className={styles.sourceDesc}>IntuneManagement, IntuneCD or this app's Backup &amp; Restore all produce compatible JSON.</div>
                </div>
              </div>
              <div className={styles.sourceRow}>
                <span className={styles.sourceNum}>→</span>
                <div>
                  <div className={styles.sourceName}>From a link (incl. Azure Blob containers)</div>
                  <div className={styles.sourceDesc}>Paste a direct <code>.json</code> URL, or an Azure Blob <b>container</b> link with a read+list SAS — we list it and pull every JSON inside. The storage account's CORS must allow this site's origin.</div>
                </div>
              </div>
              <div className={styles.sourceRow}>
                <span className={styles.sourceNum}>✕</span>
                <div>
                  <div className={styles.sourceName} style={{ color: C.ink3 }}>Not the portal's “Export” CSV</div>
                  <div className={styles.sourceDesc}>That CSV only lists policies and an assigned yes/no — it has no group targets, so it can't build an assignment report.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          <aside className={styles.panel}>
            <div className={styles.tiles}>
              <div className={styles.tile}><div className={styles.tileVal}>{result.assignedPolicyCount}</div><div className={styles.tileLabel}>Policies</div></div>
              <div className={styles.tile}><div className={styles.tileVal}>{result.records.length}</div><div className={styles.tileLabel}>Assignments</div></div>
            </div>

            <div className={styles.group}>
              <Text className={styles.sectionLabel}>Group by</Text>
              <RadioGroup value={grouping} onChange={(_, d) => applyOption(setGrouping, d.value as Grouping, { grouping: d.value as Grouping })}>
                <Radio value="group" label="Target group" />
                <Radio value="policyType" label="Policy type" />
                <Radio value="policy" label="Policy" />
              </RadioGroup>
            </div>

            <div className={styles.group}>
              <Text className={styles.sectionLabel}>Include</Text>
              <Switch checked={includeVirtual} label="All Users / All Devices" onChange={(_, d) => applyOption(setIncludeVirtual, d.checked, { includeVirtual: d.checked })} />
              <Switch checked={includeExclusions} label="Exclusion assignments" onChange={(_, d) => applyOption(setIncludeExclusions, d.checked, { includeExclusions: d.checked })} />
              <Switch checked={includeFilters} label="Assignment filters column" onChange={(_, d) => applyOption(setIncludeFilters, d.checked, { includeFilters: d.checked })} />
            </div>

            <div className={styles.actions}>
              <Button appearance="primary" icon={<ArrowDownloadRegular />} onClick={() => downloadReportHtml(html, "imported", dateStamp)}>Download</Button>
              <Button icon={<OpenRegular />} onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); } }}>Open</Button>
              <Button appearance="subtle" icon={<DocumentArrowUpRegular />} onClick={() => inputRef.current?.click()}>Add files</Button>
            </div>

            {result.unresolvedGroups > 0 && (
              <div className={styles.noteBox}>
                {result.unresolvedGroups} group{result.unresolvedGroups === 1 ? "" : "s"} shown by ID — the
                export didn't include names. Add a groups JSON, or sign in for live names.
              </div>
            )}
          </aside>

          <section className={styles.preview}>
            <iframe className={styles.frame} title="Imported assignment report" srcDoc={html} />
          </section>
        </div>
      )}
    </div>
  );
}
