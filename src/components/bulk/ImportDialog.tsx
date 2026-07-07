import { useRef, useState } from "react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions,
  Button, Text, Spinner, MessageBar, MessageBarBody,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  ArrowUploadRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
} from "@fluentui/react-icons";
import { parseImportFile, importPolicy } from "../../services/bulkActionsService";
import type { ExportedPolicy } from "../../services/bulkActionsService";

const useStyles = makeStyles({
  body: { display: "flex", flexDirection: "column", gap: "14px" },
  dropZone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "32px 24px",
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    backgroundColor: tokens.colorNeutralBackground2,
    "&:hover": { backgroundColor: tokens.colorNeutralBackground3 },
  },
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
  policyName: {
    flex: 1, minWidth: 0, overflow: "hidden",
    textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  typeTag: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
});

type Status = "pending" | "running" | "done" | "error";
interface PolicyStatus {
  policy: ExportedPolicy;
  status: Status;
  error?: string;
}

interface Props {
  onDone: () => void;
  onCancel: () => void;
}

export default function ImportDialog({ onDone, onCancel }: Props) {
  const styles = useStyles();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parseError, setParseError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<PolicyStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const updateStatus = (idx: number, patch: Partial<PolicyStatus>) =>
    setStatuses((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const handleFile = (file: File) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const policies = parseImportFile(e.target!.result as string);
        setStatuses(policies.map((p) => ({ policy: p, status: "pending" })));
      } catch (err) {
        setParseError((err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setRunning(true);
    for (let i = 0; i < statuses.length; i++) {
      updateStatus(i, { status: "running" });
      try {
        await importPolicy(statuses[i].policy);
        updateStatus(i, { status: "done" });
      } catch (e) {
        updateStatus(i, { status: "error", error: (e as Error).message });
      }
    }
    setRunning(false);
    setFinished(true);
  };

  const policyName = (p: ExportedPolicy): string =>
    (p.displayName as string | undefined) ??
    (p.name as string | undefined) ??
    "Unnamed policy";

  return (
    <Dialog open>
      <DialogSurface style={{ maxWidth: 540 }}>
        <DialogTitle>Import Policies</DialogTitle>
        <DialogBody>
          <div className={styles.body}>
            {statuses.length === 0 && !parseError && (
              <>
                <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
                  Select a JSON file previously exported from this tool or from Intune.
                </Text>
                <div
                  className={styles.dropZone}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) handleFile(file);
                  }}
                >
                  <ArrowUploadRegular style={{ fontSize: 28, color: tokens.colorNeutralForeground3 }} />
                  <Text size={300}>Click to browse or drag a .json file here</Text>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </>
            )}

            {parseError && (
              <MessageBar intent="error">
                <MessageBarBody>{parseError}</MessageBarBody>
              </MessageBar>
            )}

            {statuses.length > 0 && (
              <>
                {!finished && !running && (
                  <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
                    {statuses.length} {statuses.length === 1 ? "policy" : "policies"} ready to import.
                    Each will be created as a new policy in your tenant.
                  </Text>
                )}
                <div className={styles.policyList}>
                  {statuses.map((s, i) => (
                    <div key={i} className={styles.policyRow}>
                      <Text className={styles.policyName} size={300}>{policyName(s.policy)}</Text>
                      <Text className={styles.typeTag}>{String(s.policy._policyType)}</Text>
                      <span style={{ flexShrink: 0 }}>
                        {s.status === "pending" && running && (
                          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Waiting…</Text>
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
              </>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          {finished ? (
            <Button appearance="primary" onClick={onDone}>Done</Button>
          ) : statuses.length > 0 ? (
            <>
              <Button appearance="primary" onClick={handleImport} disabled={running}>
                {running ? <Spinner size="extra-tiny" /> : null}
                {running ? "Importing…" : `Import ${statuses.length} ${statuses.length === 1 ? "policy" : "policies"}`}
              </Button>
              <Button appearance="secondary" onClick={onCancel} disabled={running}>Cancel</Button>
            </>
          ) : (
            <Button appearance="secondary" onClick={onCancel}>Cancel</Button>
          )}
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
