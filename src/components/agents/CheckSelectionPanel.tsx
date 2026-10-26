import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, Dropdown, Option, Spinner, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { ChevronRight16Regular } from "@fluentui/react-icons";
import { ACCENTS, FONTS } from "../../theme/theme";
import { CHECKS, isWindowsArea } from "../../baseline";
import { graphGetAll } from "../../services/graphClient";
import { extraScopesFor } from "../../baseline/scopes";
import { useBenchmarkPrefs, type ChecksPreset } from "../../store/benchmarkPrefsStore";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "12px", padding: "16px", width: "460px", maxWidth: "calc(100vw - 48px)" },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  presets: { display: "flex", gap: "6px", flexWrap: "wrap" },
  list: {
    maxHeight: "48vh",
    overflowY: "auto",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "8px",
    padding: "4px 0",
  },
  area: { display: "flex", alignItems: "center", gap: "2px", paddingRight: "10px" },
  areaName: { flex: 1 },
  count: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, fontFamily: FONTS.mono },
  expand: { minWidth: "28px", width: "28px", padding: 0 },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
  checks: { paddingLeft: "40px", paddingBottom: "4px", display: "flex", flexDirection: "column" },
  checkLabel: { display: "flex", gap: "8px", alignItems: "baseline", fontSize: tokens.fontSizeBase200 },
  id: { fontFamily: FONTS.mono, color: tokens.colorNeutralForeground3, minWidth: "52px" },
  scopes: { display: "flex", gap: "4px", flexWrap: "wrap" },
  warn: { fontSize: tokens.fontSizeBase200, color: ACCENTS.danger },
  scope: { display: "flex", flexDirection: "column", gap: "6px" },
  scopeRow: { display: "flex", alignItems: "center", gap: "8px" },
  dropdown: { flex: 1, minWidth: 0 },
});

const PRESETS: Array<{ id: ChecksPreset; label: string }> = [
  { id: "all", label: "Full CIS L1" },
  { id: "entra", label: "Entra ID only" },
  { id: "intune", label: "Intune + Windows" },
  { id: "windows", label: "Windows devices only" },
];

const TENANT = "__tenant__";

/** Picks which devices the Windows settings are judged for: tenant-wide or one Autopilot deployment profile. */
function DeviceScopePicker() {
  const styles = useStyles();
  const scope = useBenchmarkPrefs((s) => s.deviceScope);
  const { setDeviceScope } = useBenchmarkPrefs.getState();
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    graphGetAll<{ id: string; displayName?: string }>("/deviceManagement/windowsAutopilotDeploymentProfiles")
      .then((rows) => { if (!cancelled) setProfiles(rows.map((r) => ({ id: r.id, name: r.displayName ?? r.id })).sort((a, b) => a.name.localeCompare(b.name))); })
      .catch((err) => { if (!cancelled) { setProfiles([]); setError((err as Error).message.slice(0, 160)); } });
    return () => { cancelled = true; };
  }, []);

  const value = scope.kind === "profile" ? scope.id : TENANT;
  const label = scope.kind === "profile" ? `Deployment profile: ${scope.name}` : "Tenant-wide (all devices / all users)";

  return (
    <div className={styles.scope}>
      <Text weight="semibold" block>Windows settings are judged for</Text>
      <div className={styles.scopeRow}>
        <Dropdown
          className={styles.dropdown}
          size="small"
          value={label}
          selectedOptions={[value]}
          onOptionSelect={(_, d) => {
            const id = d.optionValue;
            if (!id || id === TENANT) setDeviceScope({ kind: "tenant" });
            else setDeviceScope({ kind: "profile", id, name: profiles?.find((p) => p.id === id)?.name ?? id });
          }}
        >
          <Option value={TENANT}>Tenant-wide (all devices / all users)</Option>
          {(profiles ?? []).map((p) => <Option key={p.id} value={p.id}>{`Deployment profile: ${p.name}`}</Option>)}
        </Dropdown>
        {profiles === null && <Spinner size="extra-tiny" />}
      </div>
      <Text className={styles.hint}>
        {scope.kind === "profile"
          ? "Each device in the profile is checked against the policies actually assigned to its groups — a setting only passes when every device gets it. Costs two Graph reads per device."
          : "Only policies assigned to all devices or all users count fully; group-assigned policies give Partial. Choose a deployment profile to judge a real device population."}
        {" "}Only assigned settings catalog and endpoint security policies count; this is configuration intent, not device state.
      </Text>
      {error && <Text className={styles.warn}>Couldn't load deployment profiles: {error}</Text>}
    </div>
  );
}

/** Areas in baseline order, each with its checks. */
const AREA_GROUPS = (() => {
  const map = new Map<string, typeof CHECKS>();
  for (const c of CHECKS) map.set(c.area, [...(map.get(c.area) ?? []), c]);
  return [...map.entries()];
})();

/** Lets the admin choose which CIS L1 checks a benchmark runs. Stored in this browser only. */
export default function CheckSelectionPanel() {
  const styles = useStyles();
  const excludedChecks = useBenchmarkPrefs((s) => s.excludedChecks);
  const { setChecks, applyPreset } = useBenchmarkPrefs.getState();
  const [open, setOpen] = useState<string | null>(null);
  const excluded = useMemo(() => new Set(excludedChecks), [excludedChecks]);
  const selected = CHECKS.filter((c) => !excluded.has(c.id));
  const scopes = extraScopesFor(selected.map((c) => c.id));

  return (
    <div className={styles.root}>
      <div>
        <Text weight="semibold" block>Checks to run</Text>
        <Text className={styles.hint}>
          {selected.length} of {CHECKS.length} selected — Microsoft 365 tenant checks and Windows 11 device settings. Only the permissions for the selected checks are requested, and
          the report always shows how much of the benchmark was assessed.
        </Text>
      </div>
      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <Button key={p.id} size="small" onClick={() => applyPreset(p.id)}>{p.label}</Button>
        ))}
      </div>
      <div className={styles.list}>
        {AREA_GROUPS.map(([area, checks]) => {
          const on = checks.filter((c) => !excluded.has(c.id)).length;
          const isOpen = open === area;
          return (
            <div key={area}>
              <div className={styles.area}>
                <Button
                  className={styles.expand}
                  appearance="transparent"
                  size="small"
                  aria-label={`${isOpen ? "Hide" : "Show"} checks in ${area}`}
                  aria-expanded={isOpen}
                  icon={<ChevronRight16Regular className={mergeClasses(styles.chevron, isOpen && styles.chevronOpen)} />}
                  onClick={() => setOpen(isOpen ? null : area)}
                />
                <Checkbox
                  className={styles.areaName}
                  checked={on === checks.length ? true : on === 0 ? false : "mixed"}
                  onChange={(_, d) => setChecks(checks.map((c) => c.id), d.checked === true)}
                  label={area}
                />
                <span className={styles.count}>{on}/{checks.length}</span>
              </div>
              {isOpen && (
                <div className={styles.checks}>
                  {checks.map((c) => (
                    <Checkbox
                      key={c.id}
                      size="medium"
                      checked={!excluded.has(c.id)}
                      onChange={(_, d) => setChecks([c.id], d.checked === true)}
                      label={
                        <span className={styles.checkLabel}>
                          <span className={styles.id}>{c.id}</span>
                          <span>{c.title}</span>
                          {c.checkType === "manual" && <Badge size="small" appearance="outline">manual</Badge>}
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!selected.length && <Text className={styles.warn}>Select at least one check.</Text>}
      {selected.some((c) => isWindowsArea(c.area)) && <DeviceScopePicker />}
      <div>
        <Text className={styles.hint} block>Extra read permissions for this selection:</Text>
        <div className={styles.scopes}>
          {scopes.length
            ? scopes.map((s) => <Badge key={s} appearance="tint" color="informative" size="small">{s}</Badge>)
            : <Text className={styles.hint}>none beyond sign-in</Text>}
        </div>
      </div>
    </div>
  );
}
