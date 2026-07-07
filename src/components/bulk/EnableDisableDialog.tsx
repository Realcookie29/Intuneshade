import { useState } from "react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions,
  Button, RadioGroup, Radio, Text, Spinner, MessageBar, MessageBarBody,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular, DismissCircleRegular } from "@fluentui/react-icons";
import type { PolicyRow } from "../../types/policyTypes";
import { setPoliciesEnabled } from "../../services/bulkActionsService";

const useStyles = makeStyles({
  body: { display: "flex", flexDirection: "column", gap: "14px" },
  policyList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "240px",
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
});

type Status = "pending" | "running" | "done" | "error";
interface PolicyStatus { id: string; name: string; status: Status; error?: string; }

interface Props {
  distinctPolicies: PolicyRow[];
  onDone: () => void;
  onCancel: () => void;
}

export default function EnableDisableDialog({ distinctPolicies, onDone, onCancel }: Props) {
  const styles = useStyles();
  const [action, setAction] = useState<"enable" | "disable">("enable");
  const [statuses, setStatuses] = useState<PolicyStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const updateStatus = (id: string, patch: Partial<PolicyStatus>) =>
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const handleApply = async () => {
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
        await setPoliciesEnabled([p.policyId], action === "enable");
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
      <DialogSurface style={{ maxWidth: 480 }}>
        <DialogTitle>Enable / Disable Policies</DialogTitle>
        <DialogBody>
          <div className={styles.body}>
            <MessageBar intent="info">
              <MessageBarBody>
                Enable/Disable is supported for <strong>Settings Catalog</strong> policies only.
                Other policy types will return an error.
              </MessageBarBody>
            </MessageBar>

            {!finished && (
              <RadioGroup
                value={action}
                onChange={(_, d) => setAction(d.value as "enable" | "disable")}
                layout="horizontal"
                disabled={running}
              >
                <Radio value="enable" label="Enable" />
                <Radio value="disable" label="Disable" />
              </RadioGroup>
            )}

            <div className={styles.policyList}>
              {(statuses.length > 0 ? statuses : distinctPolicies.map((p) => ({ id: p.policyId, name: p.policyName, status: "pending" as Status, error: undefined }))).map((s) => (
                <div key={s.id} className={styles.policyRow}>
                  <Text className={styles.policyName} size={300}>{s.name}</Text>
                  <span>
                    {s.status === "pending" && statuses.length === 0 && null}
                    {s.status === "pending" && statuses.length > 0 && <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Waiting…</Text>}
                    {s.status === "running" && <Spinner size="extra-tiny" />}
                    {s.status === "done" && <CheckmarkCircleRegular style={{ color: tokens.colorStatusSuccessForeground1 }} />}
                    {s.status === "error" && (
                      <span title={s.error}>
                        <DismissCircleRegular style={{ color: tokens.colorStatusDangerForeground1 }} />
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          {finished ? (
            <Button appearance="primary" onClick={onDone}>Done</Button>
          ) : (
            <>
              <Button appearance="primary" onClick={handleApply} disabled={running}>
                {running ? <Spinner size="extra-tiny" /> : null}
                {running ? "Applying…" : `Apply: ${action === "enable" ? "Enable" : "Disable"}`}
              </Button>
              <Button appearance="secondary" onClick={onCancel} disabled={running}>Cancel</Button>
            </>
          )}
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
