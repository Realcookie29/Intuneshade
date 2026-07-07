import { useState } from "react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions,
  Button, Input, Label, Text, Spinner,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular, DismissCircleRegular } from "@fluentui/react-icons";
import type { PolicyType, PolicyRow } from "../../types/policyTypes";
import { clonePolicy } from "../../services/bulkActionsService";

const useStyles = makeStyles({
  body: { display: "flex", flexDirection: "column", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  policyList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "260px",
    overflowY: "auto",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: "8px 12px",
  },
  policyRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  policyName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  statusIcon: { flexShrink: 0 },
  error: { color: tokens.colorStatusDangerForeground1, fontSize: tokens.fontSizeBase200 },
});

type Status = "pending" | "running" | "done" | "error";

interface PolicyStatus {
  id: string;
  name: string;
  status: Status;
  error?: string;
}

interface Props {
  policyType: PolicyType;
  distinctPolicies: PolicyRow[];
  onDone: () => void;
  onCancel: () => void;
}

export default function CloneDialog({ policyType, distinctPolicies, onDone, onCancel }: Props) {
  const styles = useStyles();
  const [suffix, setSuffix] = useState(" (Copy)");
  const [statuses, setStatuses] = useState<PolicyStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const updateStatus = (id: string, patch: Partial<PolicyStatus>) =>
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const handleClone = async () => {
    const initial: PolicyStatus[] = distinctPolicies.map((p) => ({
      id: p.policyId,
      name: p.policyName,
      status: "pending",
    }));
    setStatuses(initial);
    setRunning(true);

    for (const p of distinctPolicies) {
      updateStatus(p.policyId, { status: "running" });
      try {
        const newName = p.policyName + suffix.trim();
        await clonePolicy(policyType, p.policyId, newName);
        updateStatus(p.policyId, { status: "done" });
      } catch (e) {
        updateStatus(p.policyId, { status: "error", error: (e as Error).message });
      }
    }

    setRunning(false);
    setFinished(true);
  };

  return (
    <Dialog open>
      <DialogSurface style={{ maxWidth: 520 }}>
        <DialogTitle>Clone {distinctPolicies.length} {distinctPolicies.length === 1 ? "Policy" : "Policies"}</DialogTitle>
        <DialogBody>
          <div className={styles.body}>
            {!finished && (
              <div className={styles.field}>
                <Label htmlFor="clone-suffix">Name suffix</Label>
                <Input
                  id="clone-suffix"
                  value={suffix}
                  onChange={(_, d) => setSuffix(d.value)}
                  placeholder=" (Copy)"
                  disabled={running}
                />
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  Each cloned policy will be named: <em>Original Name</em>{suffix || " (Copy)"}
                </Text>
              </div>
            )}

            {statuses.length > 0 && (
              <div className={styles.policyList}>
                {statuses.map((s) => (
                  <div key={s.id} className={styles.policyRow}>
                    <Text className={styles.policyName} size={300}>{s.name}</Text>
                    <span className={styles.statusIcon}>
                      {s.status === "pending" && <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Waiting…</Text>}
                      {s.status === "running" && <Spinner size="extra-tiny" />}
                      {s.status === "done" && <CheckmarkCircleRegular style={{ color: tokens.colorStatusSuccessForeground1 }} />}
                      {s.status === "error" && (
                        <span title={s.error}>
                          <DismissCircleRegular style={{ color: tokens.colorStatusDangerForeground1 }} />
                        </span>
                      )}
                    </span>
                    {s.status === "error" && s.error && (
                      <Text className={styles.error} title={s.error}>
                        {s.error.length > 60 ? s.error.slice(0, 60) + "…" : s.error}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )}

            {statuses.length === 0 && (
              <div className={styles.policyList}>
                {distinctPolicies.map((p) => (
                  <Text key={p.policyId} size={300}>{p.policyName}</Text>
                ))}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          {finished ? (
            <Button appearance="primary" onClick={onDone}>Done</Button>
          ) : (
            <>
              <Button appearance="primary" onClick={handleClone} disabled={running}>
                {running ? <Spinner size="extra-tiny" /> : null}
                {running ? "Cloning…" : "Clone"}
              </Button>
              <Button appearance="secondary" onClick={onCancel} disabled={running}>Cancel</Button>
            </>
          )}
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
