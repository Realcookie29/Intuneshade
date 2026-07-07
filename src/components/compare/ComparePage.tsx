import { useState, useMemo, useRef } from "react";
import {
  Button, Text, Spinner, Badge, Input, Switch, Combobox, Option,
  Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell,
  MessageBar, MessageBarBody, ProgressBar,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  ArrowSwapRegular, SearchRegular, DismissRegular, CheckmarkCircleFilled,
  SubtractCircleRegular, DismissCircleFilled, DesktopRegular, PersonRegular,
} from "@fluentui/react-icons";
import PageHeader from "../layout/PageHeader";
import { ACCENTS, FONTS } from "../../theme/theme";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";
import type { PolicyType } from "../../types/policyTypes";
import type { ManagedDevice, DirectoryMember } from "../../types/graphTypes";
import {
  getAssignments, isAssignmentsCached,
} from "../../services/assignmentScanService";
import {
  searchDevices, searchUsers, resolveDevice, resolveUser, computeApplied,
  type AppliedPolicy,
} from "../../services/resolverService";

function typeLabel(t: PolicyType) {
  return POLICY_DEFINITIONS.find((d) => d.type === t)?.label ?? t;
}

interface SideResult {
  deviceLabel: string;
  os: string;
  compliance: string;
  userLabel?: string;
  groupCount: number;
  applied: AppliedPolicy[];
  warnings: string[];
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  inputs: {
    display: "grid", gap: "16px", padding: "18px 28px",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "start",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  side: { display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 },
  sideLabel: {
    fontFamily: FONTS.mono, fontSize: "11px", letterSpacing: "0.12em",
    textTransform: "uppercase", color: tokens.colorNeutralForeground3,
  },
  vs: {
    alignSelf: "center", marginTop: "24px",
    fontFamily: FONTS.display, fontWeight: 600, color: ACCENTS.amber, fontSize: "18px",
  },
  actionBar: {
    display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
    padding: "12px 28px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  summary: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
    padding: "14px 28px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: "10px",
    padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  cardTitle: { display: "flex", alignItems: "center", gap: "8px" },
  meta: { display: "flex", gap: "12px", flexWrap: "wrap", fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  content: { flex: 1, overflow: "auto" },
  table: { width: "100%", minWidth: "760px" },
  headerRow: { backgroundColor: tokens.colorNeutralBackground3 },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2, textTransform: "uppercase",
    letterSpacing: "0.04em", padding: "10px 12px", whiteSpace: "nowrap",
  },
  cell: { padding: "8px 12px", verticalAlign: "middle" },
  diffRow: { boxShadow: `inset 3px 0 0 ${ACCENTS.amber}` },
  statusCell: { display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" },
  via: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: "100%", gap: "12px", color: tokens.colorNeutralForeground3, padding: "48px", textAlign: "center",
  },
  progressWrap: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    height: "100%", gap: "14px", padding: "48px",
  },
});

// ─── Async picker ─────────────────────────────────────────────────────────────

function DevicePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [opts, setOpts] = useState<ManagedDevice[]>([]);
  const q = useRef("");
  const onInput = (v: string) => {
    onChange(v);
    q.current = v;
    if (v.trim().length < 2) { setOpts([]); return; }
    searchDevices(v).then((r) => { if (q.current === v) setOpts(r); });
  };
  return (
    <Combobox
      freeform placeholder="Device name…" value={value}
      onInput={(e) => onInput((e.target as HTMLInputElement).value)}
      onOptionSelect={(_, d) => onChange(d.optionText ?? "")}
    >
      {opts.map((d) => (
        <Option key={d.id} value={d.deviceName ?? d.id} text={d.deviceName ?? ""}>
          {d.deviceName} {d.operatingSystem ? `· ${d.operatingSystem}` : ""}
        </Option>
      ))}
    </Combobox>
  );
}

function UserPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [opts, setOpts] = useState<DirectoryMember[]>([]);
  const q = useRef("");
  const onInput = (v: string) => {
    onChange(v);
    q.current = v;
    if (v.trim().length < 2) { setOpts([]); return; }
    searchUsers(v).then((r) => { if (q.current === v) setOpts(r); });
  };
  return (
    <Combobox
      freeform placeholder="User (name or UPN)…" value={value}
      onInput={(e) => onInput((e.target as HTMLInputElement).value)}
      onOptionSelect={(_, d) => onChange(d.optionText ?? "")}
    >
      {opts.map((u) => (
        <Option key={u.id} value={u.userPrincipalName ?? u.id} text={u.userPrincipalName ?? u.displayName ?? ""}>
          {u.displayName} · {u.userPrincipalName}
        </Option>
      ))}
    </Combobox>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Status = "idle" | "scanning" | "comparing" | "done";

export default function ComparePage({ mode }: { mode: "device" | "deviceUser" }) {
  const styles = useStyles();
  const withUser = mode === "deviceUser";

  const [aDevice, setADevice] = useState("");
  const [aUser, setAUser] = useState("");
  const [bDevice, setBDevice] = useState("");
  const [bUser, setBUser] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [A, setA] = useState<SideResult | null>(null);
  const [B, setB] = useState<SideResult | null>(null);

  const [onlyDiff, setOnlyDiff] = useState(true);
  const [search, setSearch] = useState("");

  const canCompare =
    aDevice.trim() && bDevice.trim() && (!withUser || (aUser.trim() && bUser.trim())) &&
    status !== "scanning" && status !== "comparing";

  const resolveSide = async (deviceName: string, userQuery: string, records: Awaited<ReturnType<typeof getAssignments>>): Promise<SideResult> => {
    const rd = await resolveDevice(deviceName);
    const groupIds = new Set(rd.groups.map((g) => g.id));
    const warnings = [...rd.warnings];
    let userLabel: string | undefined;
    let hasUser = false;
    if (withUser && userQuery.trim()) {
      const ru = await resolveUser(userQuery);
      ru.groups.forEach((g) => groupIds.add(g.id));
      warnings.push(...ru.warnings);
      userLabel = ru.user.userPrincipalName ?? ru.user.displayName;
      hasUser = true;
    }
    const applied = computeApplied(records, { groupIds, hasUser, hasDevice: true });
    return {
      deviceLabel: rd.device.deviceName ?? deviceName,
      os: [rd.device.operatingSystem, rd.device.osVersion].filter(Boolean).join(" "),
      compliance: rd.device.complianceState ?? "unknown",
      userLabel,
      groupCount: groupIds.size,
      applied,
      warnings,
    };
  };

  const compare = async () => {
    setError(null);
    setA(null); setB(null);
    try {
      let records;
      if (!isAssignmentsCached()) {
        setStatus("scanning");
        records = await getAssignments((done, total, label) => {
          setProgress(Math.round((done / total) * 100));
          setPhase(label);
        });
      } else {
        records = await getAssignments();
      }
      setStatus("comparing");
      const [ra, rb] = await Promise.all([
        resolveSide(aDevice, aUser, records),
        resolveSide(bDevice, bUser, records),
      ]);
      setA(ra); setB(rb);
      setStatus("done");
    } catch (e) {
      setError((e as Error).message);
      setStatus(A && B ? "done" : "idle");
    }
  };

  const diff = useMemo(() => {
    if (!A || !B) return [];
    const mapA = new Map(A.applied.map((p) => [p.policyId, p]));
    const mapB = new Map(B.applied.map((p) => [p.policyId, p]));
    const ids = new Set([...mapA.keys(), ...mapB.keys()]);
    const rows = [...ids].map((id) => {
      const a = mapA.get(id);
      const b = mapB.get(id);
      const appA = a?.applies ?? false;
      const appB = b?.applies ?? false;
      return {
        id,
        name: a?.policyName ?? b!.policyName,
        type: a?.policyType ?? b!.policyType,
        a, b, appA, appB,
        differs: appA !== appB,
      };
    });
    return rows.sort((x, y) =>
      x.differs !== y.differs ? (x.differs ? -1 : 1)
      : x.type === y.type ? x.name.localeCompare(y.name) : x.type.localeCompare(y.type)
    );
  }, [A, B]);

  const filteredDiff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return diff.filter((r) => (!onlyDiff || r.differs) && (!q || r.name.toLowerCase().includes(q)));
  }, [diff, onlyDiff, search]);

  const diffCount = diff.filter((r) => r.differs).length;

  const StatusCell = ({ p }: { p?: AppliedPolicy }) => {
    if (!p) return <span className={styles.statusCell}><SubtractCircleRegular style={{ color: tokens.colorNeutralForeground4 }} /><Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>Not targeted</Text></span>;
    if (p.applies) return (
      <span className={styles.statusCell}>
        <CheckmarkCircleFilled style={{ color: ACCENTS.mint }} />
        <Text size={200}>Applied</Text>
        {p.includedVia[0] && <Text className={styles.via}>· {p.includedVia[0]}</Text>}
      </span>
    );
    return (
      <span className={styles.statusCell} title={`Excluded via ${p.excludedVia.join(", ")}`}>
        <DismissCircleFilled style={{ color: ACCENTS.amber }} />
        <Text size={200}>Excluded</Text>
        {p.excludedVia[0] && <Text className={styles.via}>· {p.excludedVia[0]}</Text>}
      </span>
    );
  };

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow={withUser ? "Troubleshoot" : "Compare"}
        title={withUser ? "Device + User Compare" : "Device Compare"}
        subtitle={
          withUser
            ? "Enter two device + user pairs to see exactly which policies and apps each one gets — and where they differ."
            : "Compare the effective policy assignments of two devices to spot what's different."
        }
        icon={<ArrowSwapRegular />}
      />

      <div className={styles.inputs}>
        <div className={styles.side}>
          <span className={styles.sideLabel}>Side A</span>
          <DevicePicker value={aDevice} onChange={setADevice} />
          {withUser && <UserPicker value={aUser} onChange={setAUser} />}
        </div>
        <span className={styles.vs}>vs</span>
        <div className={styles.side}>
          <span className={styles.sideLabel}>Side B</span>
          <DevicePicker value={bDevice} onChange={setBDevice} />
          {withUser && <UserPicker value={bUser} onChange={setBUser} />}
        </div>
      </div>

      <div className={styles.actionBar}>
        <Button appearance="primary" icon={<ArrowSwapRegular />} onClick={compare} disabled={!canCompare}>
          Compare
        </Button>
        {status === "done" && (
          <>
            <Badge appearance="tint" color={diffCount ? "warning" : "success"}>
              {diffCount} difference{diffCount === 1 ? "" : "s"}
            </Badge>
            <Switch checked={onlyDiff} onChange={(_, d) => setOnlyDiff(d.checked)} label="Only differences" />
            <Input
              placeholder="Filter policies…" value={search}
              onChange={(_, d) => setSearch(d.value)}
              contentBefore={<SearchRegular />}
              contentAfter={search ? <Button size="small" appearance="transparent" icon={<DismissRegular />} onClick={() => setSearch("")} style={{ minWidth: 0, padding: "0 2px" }} /> : undefined}
              style={{ minWidth: 220, marginLeft: "auto" }}
            />
          </>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px 28px" }}>
          <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
        </div>
      )}

      {(status === "scanning" || status === "comparing") && (
        <div className={styles.progressWrap}>
          <Spinner size="large" />
          <Text weight="semibold">{status === "scanning" ? `Scanning tenant — ${phase}` : "Resolving group membership…"}</Text>
          {status === "scanning" && <div style={{ width: 280 }}><ProgressBar value={progress / 100} /></div>}
        </div>
      )}

      {status === "idle" && (
        <div className={styles.empty}>
          <ArrowSwapRegular style={{ fontSize: 48 }} />
          <Text size={500} weight="semibold">{withUser ? "Compare two device + user pairs" : "Compare two devices"}</Text>
          <Text size={300}>Fill in both sides above and hit Compare. The first run scans your tenant once, then it's instant.</Text>
        </div>
      )}

      {status === "done" && A && B && (
        <>
          <div className={styles.summary}>
            {[A, B].map((s, i) => (
              <div key={i} className={styles.card}>
                <div className={styles.cardTitle}>
                  <Badge appearance="tint" color="informative">{i === 0 ? "A" : "B"}</Badge>
                  <DesktopRegular />
                  <Text weight="semibold">{s.deviceLabel}</Text>
                </div>
                <div className={styles.meta}>
                  {s.os && <span>{s.os}</span>}
                  <span>Compliance: {s.compliance}</span>
                  {s.userLabel && <span><PersonRegular style={{ verticalAlign: "-2px" }} /> {s.userLabel}</span>}
                  <span>{s.groupCount} groups</span>
                  <span>{s.applied.filter((p) => p.applies).length} policies applied</span>
                </div>
                {s.warnings.map((w, j) => (
                  <Text key={j} size={200} style={{ color: ACCENTS.amber }}>⚠ {w}</Text>
                ))}
              </div>
            ))}
          </div>

          <div className={styles.content}>
            {filteredDiff.length === 0 ? (
              <div className={styles.empty}>
                <CheckmarkCircleFilled style={{ fontSize: 40, color: ACCENTS.mint }} />
                <Text size={400} weight="semibold">
                  {onlyDiff && diffCount === 0 ? "No differences — both get the same policies" : "Nothing matches your filter"}
                </Text>
                {onlyDiff && diffCount === 0 && (
                  <Text size={300}>Every policy applies (or doesn't) equally to both sides.</Text>
                )}
              </div>
            ) : (
              <Table className={styles.table}>
                <TableHeader>
                  <TableRow className={styles.headerRow}>
                    <TableHeaderCell className={styles.headerCell}>Type</TableHeaderCell>
                    <TableHeaderCell className={styles.headerCell}>Policy</TableHeaderCell>
                    <TableHeaderCell className={styles.headerCell}>Side A</TableHeaderCell>
                    <TableHeaderCell className={styles.headerCell}>Side B</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDiff.map((r) => (
                    <TableRow key={r.id} className={r.differs ? styles.diffRow : undefined}>
                      <TableCell className={styles.cell}><Text size={200}>{typeLabel(r.type)}</Text></TableCell>
                      <TableCell className={styles.cell}><Text size={300} weight="semibold">{r.name}</Text></TableCell>
                      <TableCell className={styles.cell}><StatusCell p={r.a} /></TableCell>
                      <TableCell className={styles.cell}><StatusCell p={r.b} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
