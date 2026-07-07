import { useState } from "react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions,
  Button, Text, Spinner, MessageBar, MessageBarBody,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular, DismissCircleRegular, DeleteRegular } from "@fluentui/react-icons";
import type { PolicyType, PolicyRow } from "../../types/policyTypes";
import { deletePolicies } from "../../services/bulkActionsService";

const useStyles = makeStyles({
  body: { display: "flex", flexDirection: "column", gap: "14px" },
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
    gap: "8px",
    minWidth: 0,
  },
  policyName: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statusCell: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },
  dangerButton: {
    color: tokens.colorStatusDangerForeground1,
  },
});

type Status = "pending" | "running" | "done" | "error";
interface PolicyStatus { id: string; name: string; status: Status; error?: string; }

interface Props {
  policyType: PolicyType;
  distinctPolicies: PolicyRow[];
  onDone: () => void;
  onCancel: () => void;
}

export default function DeletePolicyDialog({ policyType, distinctPolicies, onDone, onCancel }: Props) {
  const styles = useStyles();
  const [statuses, setStatuses] = useState<PolicyStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const updateStatus = (id: string, patch: Partial<PolicyStatus>) =>
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const handleDelete = async () => {
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
        await deletePolicies(policyType, [p.policyId]);
        updateStatus(p.policyId, { status: "done" });
      } catch (e) {
        updateStatus(p.policyId, { status: "error", error: (e as Error).message });
      }
    }

    setRunning(false);
    setFinished(true);
  };

  const displayList: PolicyStatus[] = statuses.length > 0
    ? statuses
    : distinctPolicies.map((p) => ({ id: p.policyId, name: p.policyName, status: "pending", error: undefined }));

  return (
    <Dialog open>
      <DialogSurface style={{ maxWidth: 520, width: "100%" }}>
        <DialogTitle>
          Delete {distinctPolicies.length === 1 ? "Policy" : `${distinctPolicies.length} Policies`}
        </DialogTitle>
        <DialogBody>
          <div className={styles.body}>
            {!finished && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <strong>This permanently deletes from your Intune tenant and cannot be undone.</strong>
                  {" "}All assignments will also be removed.
                </MessageBarBody>
              </MessageBar>
            )}

            <div className={styles.policyList}>
              {displayList.map((s) => (
                <div key={s.id} className={styles.policyRow}>
                  <Text className={styles.policyName} size={300}>{s.name}</Text>
                  <span className={styles.statusCell}>
                    {s.status === "pending" && statuses.length > 0 && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Waiting</Text>
                    )}
                    {s.status === "running" && <Spinner size="extra-tiny" />}
                    {s.status === "done" && (
                      <CheckmarkCircleRegular style={{ color: tokens.colorStatusSuccessForeground1 }} />
                    )}
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
              <Button
                appearance="outline"
                className={styles.dangerButton}
                icon={running ? <Spinner size="extra-tiny" /> : <DeleteRegular />}
                disabled={running}
                onClick={handleDelete}
              >
                {running ? "Deleting…" : "Delete"}
              </Button>
              <Button appearance="secondary" onClick={onCancel} disabled={running}>Cancel</Button>
            </>
          )}
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
