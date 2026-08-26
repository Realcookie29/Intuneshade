import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions,
  Button, Text, Radio, RadioGroup, Switch, Badge,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, OpenRegular, DismissRegular } from "@fluentui/react-icons";
import type { PolicyRow } from "../../types/policyTypes";
import { getTenantName } from "../../services/graphClient";
import {
  buildRequiredAppsReportHtml,
  downloadRequiredAppsReport,
  selectRequiredApps,
  PLATFORM_ORDER,
  PLATFORM_COLORS,
  type RequiredAppsGrouping,
  type RequiredAppsReportOptions,
} from "../../services/requiredAppsReportService";

const useStyles = makeStyles({
  surface: { maxWidth: "min(1200px, 94vw)", width: "min(1200px, 94vw)" },
  body: { display: "flex", gap: "16px", height: "68vh", minHeight: 0 },
  panel: {
    width: "260px", flexShrink: 0, overflowY: "auto",
    display: "flex", flexDirection: "column", gap: "18px",
    paddingRight: "16px",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  panelSection: { display: "flex", flexDirection: "column", gap: "8px" },
  panelLabel: {
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase", letterSpacing: "0.05em", color: tokens.colorNeutralForeground3,
  },
  chips: { display: "flex", flexWrap: "wrap", gap: "6px" },
  chip: { display: "flex", alignItems: "center", gap: "6px" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  preview: {
    flex: 1, minWidth: 0, borderRadius: tokens.borderRadiusMedium, overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: "#0B0D13",
  },
  frame: { width: "100%", height: "100%", border: "none", display: "block" },
  empty: {
    height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: "10px", color: tokens.colorNeutralForeground3,
    textAlign: "center", padding: "40px",
  },
});

interface Props {
  rows: PolicyRow[];
  onClose: () => void;
}

export default function RequiredAppsReportDialog({ rows, onClose }: Props) {
  const styles = useStyles();
  const { accounts } = useMsal();
  const account = accounts[0];

  const [grouping, setGrouping] = useState<RequiredAppsGrouping>("platform");
  const [includeVirtual, setIncludeVirtual] = useState(true);
  const [includeExclusions, setIncludeExclusions] = useState(true);
  const [includeFilters, setIncludeFilters] = useState(true);
  const [tenantName, setTenantName] = useState("");

  const options: RequiredAppsReportOptions = useMemo(
    () => ({ grouping, includeVirtual, includeExclusions, includeFilters }),
    [grouping, includeVirtual, includeExclusions, includeFilters],
  );

  // The report is built entirely from the Applications table that is already
  // loaded, so no extra Graph calls are needed — only the organisation name.
  useEffect(() => {
    getTenantName().then(setTenantName).catch(() => setTenantName(""));
  }, []);

  const resolvedTenant =
    tenantName || account?.username?.split("@")[1] || "Unknown tenant";

  const records = useMemo(() => selectRequiredApps(rows, options), [rows, options]);

  const html = useMemo(
    () =>
      buildRequiredAppsReportHtml(rows, options, {
        tenantName: resolvedTenant,
        generatedBy: account?.username ?? account?.name ?? "Unknown",
        generatedAt: new Date().toLocaleString(),
      }),
    [rows, options, resolvedTenant, account],
  );

  const platformCounts = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of records) {
      if (!map.has(r.platform)) map.set(r.platform, new Set());
      map.get(r.platform)!.add(r.appId);
    }
    return PLATFORM_ORDER.filter((p) => map.has(p)).map((p) => ({
      platform: p,
      count: map.get(p)!.size,
    }));
  }, [records]);

  const appCount = new Set(records.map((r) => r.appId)).size;
  const dateStamp = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface className={styles.surface}>
        <DialogTitle
          action={<Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} />}
        >
          Required Applications Report
        </DialogTitle>
        <DialogBody>
          <div className={styles.body}>
            <aside className={styles.panel}>
              <div className={styles.panelSection}>
                <Text className={styles.panelLabel}>Scope</Text>
                <Text size={200}>
                  Only assignments with install intent <b>Required</b> are included.
                </Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {appCount} apps · {records.length} assignments
                </Text>
              </div>

              <div className={styles.panelSection}>
                <Text className={styles.panelLabel}>Platforms found</Text>
                <div className={styles.chips}>
                  {platformCounts.length === 0 && (
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>None</Text>
                  )}
                  {platformCounts.map((p) => (
                    <Badge key={p.platform} appearance="outline" className={styles.chip}>
                      <span
                        className={styles.dot}
                        style={{ background: PLATFORM_COLORS[p.platform] }}
                      />
                      {p.platform} {p.count}
                    </Badge>
                  ))}
                </div>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  Use the platform chips inside the report to filter it interactively.
                </Text>
              </div>

              <div className={styles.panelSection}>
                <Text className={styles.panelLabel}>Group by</Text>
                <RadioGroup
                  value={grouping}
                  onChange={(_, d) => setGrouping(d.value as RequiredAppsGrouping)}
                >
                  <Radio value="platform" label="Platform" />
                  <Radio value="app" label="Application" />
                  <Radio value="group" label="Target group" />
                </RadioGroup>
              </div>

              <div className={styles.panelSection}>
                <Text className={styles.panelLabel}>Include</Text>
                <Switch
                  checked={includeVirtual}
                  label="All Users / All Devices"
                  onChange={(_, d) => setIncludeVirtual(d.checked)}
                />
                <Switch
                  checked={includeExclusions}
                  label="Exclusion assignments"
                  onChange={(_, d) => setIncludeExclusions(d.checked)}
                />
                <Switch
                  checked={includeFilters}
                  label="Assignment filters column"
                  onChange={(_, d) => setIncludeFilters(d.checked)}
                />
              </div>
            </aside>

            <section className={styles.preview}>
              {records.length === 0 ? (
                <div className={styles.empty}>
                  <Text size={400} weight="semibold">No Required apps found</Text>
                  <Text size={300}>
                    None of the loaded applications have an assignment with install intent
                    “Required” that matches the selected options.
                  </Text>
                </div>
              ) : (
                <iframe className={styles.frame} title="Required applications report" srcDoc={html} />
              )}
            </section>
          </div>
        </DialogBody>
        <DialogActions>
          <Button
            icon={<OpenRegular />}
            disabled={records.length === 0}
            onClick={() => {
              const w = window.open("", "_blank");
              if (w) { w.document.write(html); w.document.close(); }
            }}
          >
            Open in new tab
          </Button>
          <Button
            appearance="primary"
            icon={<ArrowDownloadRegular />}
            disabled={records.length === 0}
            onClick={() => downloadRequiredAppsReport(html, resolvedTenant, dateStamp)}
          >
            Download HTML
          </Button>
          <Button appearance="secondary" onClick={onClose}>Close</Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
