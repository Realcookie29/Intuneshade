import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Button, Text, Spinner, Switch, Radio, RadioGroup, Field,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  DocumentTableRegular, ScanRegular, ArrowDownloadRegular,
  OpenRegular, ArrowSyncRegular,
} from "@fluentui/react-icons";
import PageHeader from "../layout/PageHeader";
import { getAssignments, isAssignmentsCached, type AssignmentRecord } from "../../services/assignmentScanService";
import { getTenantName } from "../../services/graphClient";
import {
  buildReportHtml, downloadReportHtml,
  type ReportGrouping, type ReportOptions,
} from "../../services/assignmentReportService";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  body: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" },
  panel: {
    width: "300px", flexShrink: 0, overflowY: "auto",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: "20px", display: "flex", flexDirection: "column", gap: "18px",
  },
  panelSection: { display: "flex", flexDirection: "column", gap: "8px" },
  panelLabel: {
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase", letterSpacing: "0.05em", color: tokens.colorNeutralForeground3,
  },
  preview: { flex: 1, position: "relative", minWidth: 0, backgroundColor: tokens.colorNeutralBackground1 },
  frame: { width: "100%", height: "100%", border: "none", display: "block" },
  center: {
    height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: "14px", color: tokens.colorNeutralForeground3,
    textAlign: "center", padding: "48px",
  },
  actions: { display: "flex", gap: "8px" },
});

type Status = "idle" | "scanning" | "ready";

export default function AssignmentReportPage() {
  const styles = useStyles();
  const { accounts } = useMsal();
  const account = accounts[0];

  const [status, setStatus] = useState<Status>("idle");
  const [phase, setPhase] = useState("");
  const [records, setRecords] = useState<AssignmentRecord[]>([]);
  const [html, setHtml] = useState("");
  const [tenantName, setTenantName] = useState("");

  const [grouping, setGrouping] = useState<ReportGrouping>("group");
  const [includeVirtual, setIncludeVirtual] = useState(true);
  const [includeExclusions, setIncludeExclusions] = useState(true);
  const [includeFilters, setIncludeFilters] = useState(true);

  const options: ReportOptions = { grouping, includeVirtual, includeExclusions, includeFilters };

  // Report metadata. The tenant line uses the organization name (from Graph),
  // falling back to the sign-in domain — never the signed-in user's name.
  const buildMeta = (tName: string) => ({
    tenantName: tName || account?.username?.split("@")[1] || "Unknown tenant",
    generatedBy: account?.username ?? account?.name ?? "Unknown",
    generatedAt: new Date().toLocaleString(),
  });

  const regenerate = (recs: AssignmentRecord[], opts: ReportOptions) => {
    setHtml(buildReportHtml(recs, opts, buildMeta(tenantName)));
  };

  const scan = async (force = false) => {
    // If the tenant was already scanned at login, reuse the cache instantly
    // without flashing the scanning state.
    const warm = isAssignmentsCached() && !force;
    if (!warm) {
      setStatus("scanning");
      setPhase("Starting scan…");
    }
    try {
      // Fetch assignments and the tenant name together so the report is built
      // with the real organization name in one pass (both are cached after the
      // first call, so the warm path stays fast). A failed org lookup falls
      // back to the sign-in domain.
      const [recs, tName] = await Promise.all([
        getAssignments(
          (done, total, label) => setPhase(label ? `Scanning ${label}… (${done}/${total})` : "Finishing…"),
          force,
        ),
        getTenantName().catch(() => ""),
      ]);
      setTenantName(tName);
      setRecords(recs);
      setHtml(buildReportHtml(recs, options, buildMeta(tName)));
      setStatus("ready");
    } catch {
      setStatus("idle");
    }
    setPhase("");
  };

  // Auto-build from the shared cache on mount — instant when the login warm-up
  // has already scanned the tenant. Only a manual "Rescan" hits Graph again.
  // Deferred to a microtask so the first state update lands outside the effect.
  useEffect(() => {
    queueMicrotask(() => void scan(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render the preview immediately when an option changes (no rescan needed).
  const applyOption = <T,>(setter: (v: T) => void, value: T, next: Partial<ReportOptions>) => {
    setter(value);
    if (status === "ready") regenerate(records, { ...options, ...next });
  };

  const dateStamp = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Report"
        title="Assignment Report"
        subtitle="Generate a polished, self-contained HTML report of every policy assignment across your tenant — ready to share, archive or print to PDF."
        icon={<DocumentTableRegular />}
        actions={
          status === "ready" ? (
            <div className={styles.actions}>
              <Button icon={<ArrowSyncRegular />} onClick={() => scan(true)}>
                Rescan
              </Button>
              <Button
                icon={<OpenRegular />}
                onClick={() => {
                  const w = window.open("", "_blank");
                  if (w) { w.document.write(html); w.document.close(); }
                }}
              >
                Open in new tab
              </Button>
              <Button appearance="primary" icon={<ArrowDownloadRegular />}
                onClick={() => downloadReportHtml(html, buildMeta(tenantName).tenantName, dateStamp)}>
                Download HTML
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className={styles.body}>
        <aside className={styles.panel}>
          <div className={styles.panelSection}>
            <Text className={styles.panelLabel}>Group by</Text>
            <RadioGroup
              value={grouping}
              onChange={(_, d) => applyOption(setGrouping, d.value as ReportGrouping, { grouping: d.value as ReportGrouping })}
            >
              <Radio value="group" label="Target group" />
              <Radio value="policyType" label="Policy type" />
              <Radio value="policy" label="Policy" />
            </RadioGroup>
          </div>

          <div className={styles.panelSection}>
            <Text className={styles.panelLabel}>Include</Text>
            <Switch checked={includeVirtual} label="All Users / All Devices"
              onChange={(_, d) => applyOption(setIncludeVirtual, d.checked, { includeVirtual: d.checked })} />
            <Switch checked={includeExclusions} label="Exclusion assignments"
              onChange={(_, d) => applyOption(setIncludeExclusions, d.checked, { includeExclusions: d.checked })} />
            <Switch checked={includeFilters} label="Assignment filters column"
              onChange={(_, d) => applyOption(setIncludeFilters, d.checked, { includeFilters: d.checked })} />
          </div>

          <Field>
            <Button
              appearance="primary" size="large"
              icon={status === "scanning" ? <Spinner size="extra-tiny" /> : <ScanRegular />}
              disabled={status === "scanning"}
              onClick={() => scan(false)}
            >
              {status === "scanning" ? "Scanning…" : status === "ready" ? "Refresh preview" : "Build report"}
            </Button>
          </Field>

          {status === "ready" && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {records.length} assignments scanned. Toggle options above to update the preview instantly, then download or open in a new tab.
            </Text>
          )}
        </aside>

        <section className={styles.preview}>
          {status === "idle" && (
            <div className={styles.center}>
              <DocumentTableRegular style={{ fontSize: 48 }} />
              <Text size={500} weight="semibold">Build an assignment report</Text>
              <Text size={300}>
                Choose your options on the left and press “Build report” to scan every policy type
                and preview a shareable HTML document here.
              </Text>
              <Button appearance="primary" icon={<ScanRegular />} onClick={() => scan(false)}>
                Build report
              </Button>
            </div>
          )}

          {status === "scanning" && (
            <div className={styles.center}>
              <Spinner size="large" />
              <Text size={400} weight="semibold">{phase || "Scanning tenant…"}</Text>
            </div>
          )}

          {status === "ready" && (
            <iframe className={styles.frame} title="Assignment report preview" srcDoc={html} />
          )}
        </section>
      </div>
    </div>
  );
}
