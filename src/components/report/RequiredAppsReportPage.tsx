import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  Button, Text, Radio, RadioGroup, Switch, Badge, Spinner, Dropdown, Option,
  MessageBar, MessageBarBody, ProgressBar,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  DocumentBulletListRegular, ArrowDownloadRegular, OpenRegular, ArrowSyncRegular,
  VehicleCarRegular, ScanRegular,
} from "@fluentui/react-icons";
import PageHeader from "../layout/PageHeader";
import ErrorMessage from "../common/ErrorMessage";
import { usePolicies } from "../../hooks/usePolicies";
import { getTenantName } from "../../services/graphClient";
import {
  scanProfileDevices, isProfileScanned,
  type ResolvedProfileDevices,
} from "../../services/deploymentProfileService";
import {
  buildRequiredAppsReportHtml,
  downloadRequiredAppsReport,
  selectRequiredApps,
  applyProfileFilter,
  PLATFORM_ORDER,
  PLATFORM_COLORS,
  type RequiredAppsGrouping,
  type RequiredAppsReportOptions,
  type ProfileReportInfo,
} from "../../services/requiredAppsReportService";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  body: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" },
  panel: {
    width: "320px", flexShrink: 0, overflowY: "auto",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: "20px", display: "flex", flexDirection: "column", gap: "18px",
  },
  panelSection: { display: "flex", flexDirection: "column", gap: "8px" },
  panelLabel: {
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase", letterSpacing: "0.05em", color: tokens.colorNeutralForeground3,
  },
  chips: { display: "flex", flexWrap: "wrap", gap: "6px" },
  chip: { display: "flex", alignItems: "center", gap: "6px" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  hint: { color: tokens.colorNeutralForeground3 },
  preview: { flex: 1, position: "relative", minWidth: 0, backgroundColor: tokens.colorNeutralBackground1 },
  frame: { width: "100%", height: "100%", border: "none", display: "block" },
  center: {
    height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: "14px", color: tokens.colorNeutralForeground3,
    textAlign: "center", padding: "48px",
  },
  actions: { display: "flex", gap: "8px" },
});

const NO_PROFILE = "__none__";

interface ProfileSummary {
  id: string;
  name: string;
  includeGroupIds: string[];
  includeGroupNames: string[];
  targetsEveryone: boolean;
}

export default function RequiredAppsReportPage() {
  const styles = useStyles();
  const { accounts } = useMsal();
  const account = accounts[0];

  // Both tables come from the shared policy cache, so this is instant whenever
  // the Applications / Autopilot tabs have already been opened this session.
  const { rows, isLoading, error, refresh } = usePolicies("mobileApps");
  const { rows: profileRows } = usePolicies("windowsAutopilotDeploymentProfiles");

  const [grouping, setGrouping] = useState<RequiredAppsGrouping>("platform");
  const [includeVirtual, setIncludeVirtual] = useState(true);
  const [includeExclusions, setIncludeExclusions] = useState(true);
  const [includeFilters, setIncludeFilters] = useState(true);
  const [tenantName, setTenantName] = useState("");

  const [profileId, setProfileId] = useState<string>(NO_PROFILE);
  const [scan, setScan] = useState<ResolvedProfileDevices | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [scanError, setScanError] = useState<string | null>(null);

  const options: RequiredAppsReportOptions = useMemo(
    () => ({ grouping, includeVirtual, includeExclusions, includeFilters }),
    [grouping, includeVirtual, includeExclusions, includeFilters],
  );

  useEffect(() => {
    getTenantName().then(setTenantName).catch(() => setTenantName(""));
  }, []);

  const resolvedTenant = tenantName || account?.username?.split("@")[1] || "Unknown tenant";

  // ── Autopilot deployment profiles, folded from assignment rows ────────────
  const profiles: ProfileSummary[] = useMemo(() => {
    const byId = new Map<string, ProfileSummary>();
    for (const r of profileRows) {
      if (!byId.has(r.policyId)) {
        byId.set(r.policyId, {
          id: r.policyId,
          name: r.policyName,
          includeGroupIds: [],
          includeGroupNames: [],
          targetsEveryone: false,
        });
      }
      const p = byId.get(r.policyId)!;
      if (r.assignmentType === "Include" && r.groupId) {
        p.includeGroupIds.push(r.groupId);
        p.includeGroupNames.push(r.groupDisplayName || r.groupId);
      } else if (r.assignmentType === "All Devices" || r.assignmentType === "All Users") {
        p.targetsEveryone = true;
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [profileRows]);

  const selectedProfile = profiles.find((p) => p.id === profileId) ?? null;

  // Switching profiles drops the previous device scan from view (the service
  // keeps its own cache, so re-selecting is instant).
  const changeProfile = (id: string) => {
    setProfileId(id);
    setScanError(null);
    setScan(null);
    if (id !== NO_PROFILE && isProfileScanned(id)) {
      void scanProfileDevices(id).then(setScan).catch(() => undefined);
    }
  };

  const runScan = async (force = false) => {
    if (!selectedProfile) return;
    setScanning(true);
    setScanError(null);
    setScanProgress({ done: 0, total: 0 });
    try {
      const result = await scanProfileDevices(
        selectedProfile.id,
        (done, total) => setScanProgress({ done, total }),
        force,
      );
      setScan(result);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "The device scan failed.");
    } finally {
      setScanning(false);
    }
  };

  // ── Records ───────────────────────────────────────────────────────────────
  const baseRecords = useMemo(() => selectRequiredApps(rows, options), [rows, options]);

  const profileInfo: ProfileReportInfo | undefined = useMemo(() => {
    if (!selectedProfile) return undefined;
    if (scan) {
      return {
        name: selectedProfile.name,
        mode: "devices",
        targetGroups: selectedProfile.includeGroupNames,
        deviceCount: scan.devices.length,
        resolvedGroups: scan.groupIds.size,
      };
    }
    return {
      name: selectedProfile.name,
      mode: "groups",
      targetGroups: selectedProfile.includeGroupNames,
    };
  }, [selectedProfile, scan]);

  const records = useMemo(() => {
    if (!selectedProfile) return baseRecords;
    return applyProfileFilter(
      baseRecords,
      scan
        ? {
            name: selectedProfile.name,
            mode: "devices",
            groupIds: scan.groupIds,
            deviceCount: scan.devices.length,
            deviceCountByGroupId: scan.deviceCountByGroupId,
          }
        : {
            name: selectedProfile.name,
            mode: "groups",
            groupIds: new Set(selectedProfile.includeGroupIds),
          },
      includeVirtual,
    );
  }, [baseRecords, selectedProfile, scan, includeVirtual]);

  const html = useMemo(
    () =>
      buildRequiredAppsReportHtml(
        records,
        options,
        {
          tenantName: resolvedTenant,
          generatedBy: account?.username ?? account?.name ?? "Unknown",
          generatedAt: new Date().toLocaleString(),
        },
        profileInfo,
      ),
    [records, options, resolvedTenant, account, profileInfo],
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
  const groupCount = new Set(records.filter((r) => r.targetKind === "group").map((r) => r.target)).size;
  const dateStamp = new Date().toISOString().slice(0, 10);
  const hasData = !isLoading && records.length > 0;

  const fileTenant = selectedProfile ? `${resolvedTenant}-${selectedProfile.name}` : resolvedTenant;

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Report"
        title="Required Apps Report"
        subtitle="Every application assigned with install intent “Required”, as a self-contained HTML report you can filter per platform and per target group — or narrow to a single Autopilot deployment profile."
        icon={<DocumentBulletListRegular />}
        actions={
          <div className={styles.actions}>
            <Button icon={<ArrowSyncRegular />} disabled={isLoading} onClick={refresh}>
              Refresh
            </Button>
            <Button
              icon={<OpenRegular />}
              disabled={!hasData}
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
              disabled={!hasData}
              onClick={() => downloadRequiredAppsReport(html, fileTenant, dateStamp)}
            >
              Download HTML
            </Button>
          </div>
        }
      />

      <div className={styles.body}>
        <aside className={styles.panel}>
          <div className={styles.panelSection}>
            <Text className={styles.panelLabel}>Scope</Text>
            <Text size={200}>
              Only assignments with install intent <b>Required</b> are included.
            </Text>
            <Text size={200} className={styles.hint}>
              {appCount} apps · {records.length} assignments · {groupCount} groups
            </Text>
          </div>

          {/* ── Autopilot deployment profile ─────────────────────────────── */}
          <div className={styles.panelSection}>
            <Text className={styles.panelLabel}>Autopilot profile</Text>
            <Dropdown
              value={selectedProfile?.name ?? "All devices (no profile)"}
              selectedOptions={[profileId]}
              onOptionSelect={(_, d) => changeProfile(d.optionValue ?? NO_PROFILE)}
              disabled={profiles.length === 0}
              placeholder={profiles.length === 0 ? "No deployment profiles found" : undefined}
            >
              <Option value={NO_PROFILE} text="All devices (no profile)">
                All devices (no profile)
              </Option>
              {profiles.map((p) => (
                <Option key={p.id} value={p.id} text={p.name}>
                  {p.name}
                </Option>
              ))}
            </Dropdown>

            {selectedProfile && !scan && (
              <>
                <Text size={200} className={styles.hint}>
                  Showing Required apps on the group(s) this profile is assigned to:{" "}
                  {selectedProfile.includeGroupNames.length
                    ? selectedProfile.includeGroupNames.join(", ")
                    : "none"}.
                </Text>
                {selectedProfile.targetsEveryone && (
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      This profile targets All Devices/All Users, so narrowing by its groups says
                      little. Run the device scan for an accurate list.
                    </MessageBarBody>
                  </MessageBar>
                )}
              </>
            )}

            {selectedProfile && scan && (
              <Text size={200} className={styles.hint}>
                Resolved from {scan.devices.length} device(s) in {scan.groupIds.size} group(s).
                {scan.unresolved > 0 && ` ${scan.unresolved} device(s) could not be resolved.`}
              </Text>
            )}

            {selectedProfile && (
              <Button
                icon={scanning ? <Spinner size="extra-tiny" /> : <ScanRegular />}
                disabled={scanning}
                onClick={() => runScan(scan !== null)}
              >
                {scanning
                  ? "Scanning devices…"
                  : scan
                    ? "Rescan devices"
                    : "Resolve actual devices"}
              </Button>
            )}

            {scanning && (
              <>
                <ProgressBar
                  value={scanProgress.total ? scanProgress.done / scanProgress.total : undefined}
                />
                <Text size={200} className={styles.hint}>
                  {scanProgress.total
                    ? `${scanProgress.done} / ${scanProgress.total} devices`
                    : "Fetching the profile's devices…"}
                </Text>
              </>
            )}

            {scanError && (
              <MessageBar intent="error">
                <MessageBarBody>{scanError}</MessageBarBody>
              </MessageBar>
            )}

            {scan?.warnings.map((w) => (
              <MessageBar key={w} intent="warning">
                <MessageBarBody>{w}</MessageBarBody>
              </MessageBar>
            ))}
          </div>

          <div className={styles.panelSection}>
            <Text className={styles.panelLabel}>Platforms found</Text>
            <div className={styles.chips}>
              {platformCounts.length === 0 && (
                <Text size={200} className={styles.hint}>None</Text>
              )}
              {platformCounts.map((p) => (
                <Badge key={p.platform} appearance="outline" className={styles.chip}>
                  <span className={styles.dot} style={{ background: PLATFORM_COLORS[p.platform] }} />
                  {p.platform} {p.count}
                </Badge>
              ))}
            </div>
            <Text size={200} className={styles.hint}>
              The report itself has a platform filter, a target-group picker and a search box.
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
            <Switch checked={includeVirtual} label="All Users / All Devices"
              onChange={(_, d) => setIncludeVirtual(d.checked)} />
            <Switch checked={includeExclusions} label="Exclusion assignments"
              onChange={(_, d) => setIncludeExclusions(d.checked)} />
            <Switch checked={includeFilters} label="Assignment filters column"
              onChange={(_, d) => setIncludeFilters(d.checked)} />
          </div>
        </aside>

        <section className={styles.preview}>
          {error && (
            <div style={{ padding: "12px 24px" }}>
              <ErrorMessage message={error} />
            </div>
          )}

          {isLoading ? (
            <div className={styles.center}>
              <Spinner size="large" />
              <Text size={400} weight="semibold">Loading applications…</Text>
            </div>
          ) : records.length === 0 ? (
            <div className={styles.center}>
              {selectedProfile ? <VehicleCarRegular style={{ fontSize: 48 }} />
                : <DocumentBulletListRegular style={{ fontSize: 48 }} />}
              <Text size={500} weight="semibold">No Required apps found</Text>
              <Text size={300}>
                {selectedProfile
                  ? `No Required app assignments reach “${selectedProfile.name}” with the selected options.`
                  : "None of the applications in this tenant have an assignment with install intent “Required” that matches the selected options."}
              </Text>
            </div>
          ) : (
            <iframe className={styles.frame} title="Required applications report" srcDoc={html} />
          )}
        </section>
      </div>
    </div>
  );
}
