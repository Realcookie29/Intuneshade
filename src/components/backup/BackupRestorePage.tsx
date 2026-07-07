import { useState, useRef, useMemo } from "react";
import {
  Button, Text, Spinner, Badge, Checkbox, TabList, Tab,
  MessageBar, MessageBarBody, ProgressBar,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  ArrowSyncCircle24Regular, ArrowDownloadRegular, ArrowUploadRegular,
  CheckmarkCircleRegular, DismissCircleRegular, SaveRegular,
} from "@fluentui/react-icons";
import {
  backupAllPolicies, downloadBackup, parseImportFile, importPolicy, policyDisplayName,
} from "../../services/bulkActionsService";
import type { ExportedPolicy } from "../../services/bulkActionsService";
import type { PolicyType } from "../../types/policyTypes";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";
import PageHeader from "../layout/PageHeader";

function typeLabel(t: PolicyType): string {
  return POLICY_DEFINITIONS.find((d) => d.type === t)?.label ?? t;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  hero: {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)",
    padding: "24px 32px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "24px", flexWrap: "wrap",
  },
  heroLeft: { display: "flex", flexDirection: "column", gap: "4px" },
  heroTitle: { color: "white", fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: tokens.fontSizeBase300, maxWidth: "560px" },
  tabs: { padding: "0 24px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  content: { flex: 1, overflow: "auto", padding: "24px" },
  card: {
    maxWidth: "720px", display: "flex", flexDirection: "column", gap: "14px",
  },
  dropZone: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "8px", padding: "36px 24px", border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium, cursor: "pointer",
    backgroundColor: tokens.colorNeutralBackground2,
    ":hover": { backgroundColor: tokens.colorNeutralBackground3 },
  },
  typeGroup: {
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    marginBottom: "10px", overflow: "hidden",
  },
  typeHeader: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 12px", backgroundColor: tokens.colorNeutralBackground3,
  },
  policyRow: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "6px 12px 6px 32px", borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  policyName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

type BackupPhase = "idle" | "running" | "done";
type ImportStatus = "pending" | "running" | "done" | "error";

interface RestoreItem {
  policy: ExportedPolicy;
  selected: boolean;
  status: ImportStatus;
  error?: string;
}

export default function BackupRestorePage() {
  const styles = useStyles();
  const [tab, setTab] = useState<"backup" | "restore">("backup");

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Protect"
        title="Backup & Restore"
        subtitle="Export every Intune policy across all types into a single file, and restore them into this or another tenant — a full-tenant snapshot in one click."
        icon={<ArrowSyncCircle24Regular />}
      />

      <div className={styles.tabs}>
        <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as "backup" | "restore")}>
          <Tab value="backup" icon={<ArrowDownloadRegular />}>Backup</Tab>
          <Tab value="restore" icon={<ArrowUploadRegular />}>Restore</Tab>
        </TabList>
      </div>

      <div className={styles.content}>
        {tab === "backup" ? <BackupTab /> : <RestoreTab />}
      </div>
    </div>
  );
}

// ─── Backup ─────────────────────────────────────────────────────────────────

function BackupTab() {
  const styles = useStyles();
  const [phase, setPhase] = useState<BackupPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);

  const run = async () => {
    setPhase("running");
    setError(null);
    setProgress(0);
    setCount(0);
    try {
      const result = await backupAllPolicies((done, total, lbl, c) => {
        setProgress(done / total);
        setLabel(lbl);
        setCount(c);
      });
      setPayload(result.payload);
      setCount(result.policies.length);
      downloadBackup(result.payload);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  };

  return (
    <div className={styles.card}>
      <Text size={400} weight="semibold">Create a full-tenant backup</Text>
      <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
        This scans all {POLICY_DEFINITIONS.length} policy types and downloads the full
        configuration of every policy as one JSON file. Assignments and tenant-specific
        IDs are stripped so the file can be restored anywhere.
      </Text>

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      {phase === "running" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ProgressBar value={progress} />
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {label ? `Backing up ${label}…` : "Finishing…"} · {count} policies captured
          </Text>
        </div>
      )}

      {phase === "done" && (
        <MessageBar intent="success">
          <MessageBarBody>
            Backup complete — {count} policies saved. The file has been downloaded.
          </MessageBarBody>
        </MessageBar>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <Button
          appearance="primary"
          icon={phase === "running" ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={run}
          disabled={phase === "running"}
        >
          {phase === "running" ? "Backing up…" : phase === "done" ? "Run backup again" : "Create backup"}
        </Button>
        {phase === "done" && payload && (
          <Button appearance="secondary" icon={<ArrowDownloadRegular />}
            onClick={() => downloadBackup(payload)}>
            Download again
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Restore ────────────────────────────────────────────────────────────────

function RestoreTab() {
  const styles = useStyles();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<RestoreItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const handleFile = (file: File) => {
    setParseError(null);
    setFinished(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const policies = parseImportFile(e.target!.result as string);
        setItems(policies.map((p) => ({ policy: p, selected: true, status: "pending" })));
      } catch (err) {
        setParseError((err as Error).message);
        setItems([]);
      }
    };
    reader.readAsText(file);
  };

  const grouped = useMemo(() => {
    const map = new Map<PolicyType, number[]>();
    items.forEach((it, idx) => {
      const t = it.policy._policyType;
      const arr = map.get(t) ?? [];
      arr.push(idx);
      map.set(t, arr);
    });
    return [...map.entries()];
  }, [items]);

  const selectedCount = items.filter((i) => i.selected).length;

  const toggle = (idx: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, selected: !it.selected } : it)));

  const toggleGroup = (indices: number[], value: boolean) =>
    setItems((prev) => prev.map((it, i) => (indices.includes(i) ? { ...it, selected: value } : it)));

  const setStatus = (idx: number, patch: Partial<RestoreItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const restore = async () => {
    setRunning(true);
    for (let i = 0; i < items.length; i++) {
      if (!items[i].selected) continue;
      setStatus(i, { status: "running" });
      try {
        await importPolicy(items[i].policy);
        setStatus(i, { status: "done" });
      } catch (e) {
        setStatus(i, { status: "error", error: (e as Error).message });
      }
    }
    setRunning(false);
    setFinished(true);
  };

  const reset = () => { setItems([]); setParseError(null); setFinished(false); };

  return (
    <div className={styles.card}>
      {items.length === 0 && (
        <>
          <Text size={400} weight="semibold">Restore from a backup file</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
            Upload a backup JSON (from this tool or a per-type export). Each selected policy
            is created as a <strong>new</strong> policy — existing policies are never overwritten.
            Assignments are not restored.
          </Text>
          <div
            className={styles.dropZone}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <ArrowUploadRegular style={{ fontSize: 28, color: tokens.colorNeutralForeground3 }} />
            <Text size={300}>Click to browse or drag a .json backup here</Text>
          </div>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </>
      )}

      {parseError && <MessageBar intent="error"><MessageBarBody>{parseError}</MessageBarBody></MessageBar>}

      {items.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Text size={400} weight="semibold">{items.length} policies in backup</Text>
            <Badge appearance="tint">{selectedCount} selected</Badge>
            <Button size="small" appearance="subtle" onClick={reset} disabled={running}>Choose another file</Button>
          </div>

          {finished && (
            <MessageBar intent="success">
              <MessageBarBody>
                Restore finished. {items.filter((i) => i.status === "done").length} created,{" "}
                {items.filter((i) => i.status === "error").length} failed.
              </MessageBarBody>
            </MessageBar>
          )}

          <div>
            {grouped.map(([type, indices]) => {
              const allSel = indices.every((i) => items[i].selected);
              const someSel = indices.some((i) => items[i].selected);
              return (
                <div key={type} className={styles.typeGroup}>
                  <div className={styles.typeHeader}>
                    <Checkbox
                      checked={allSel ? true : someSel ? "mixed" : false}
                      onChange={(_, d) => toggleGroup(indices, !!d.checked)}
                      disabled={running}
                    />
                    <Text weight="semibold" size={300}>{typeLabel(type)}</Text>
                    <Badge appearance="ghost" size="small">{indices.length}</Badge>
                  </div>
                  {indices.map((idx) => {
                    const it = items[idx];
                    return (
                      <div key={idx} className={styles.policyRow}>
                        <Checkbox checked={it.selected} onChange={() => toggle(idx)} disabled={running} />
                        <Text className={styles.policyName} size={300}>{policyDisplayName(it.policy)}</Text>
                        {it.status === "running" && <Spinner size="extra-tiny" />}
                        {it.status === "done" && <CheckmarkCircleRegular style={{ color: tokens.colorStatusSuccessForeground1 }} />}
                        {it.status === "error" && (
                          <span title={it.error}><DismissCircleRegular style={{ color: tokens.colorStatusDangerForeground1 }} /></span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Button
              appearance="primary"
              icon={running ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
              onClick={restore}
              disabled={running || selectedCount === 0 || finished}
            >
              {running ? "Restoring…" : `Restore ${selectedCount} selected`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
