import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Text,
  Badge,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { WarningRegular } from "@fluentui/react-icons";
import type { PolicyRow } from "../../types/policyTypes";

const useStyles = makeStyles({
  warning: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    backgroundColor: tokens.colorStatusWarningBackground1,
    border: `1px solid ${tokens.colorStatusWarningBorder1}`,
    borderRadius: "4px",
    padding: "12px",
    marginBottom: "16px",
    color: tokens.colorStatusWarningForeground1,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "240px",
    overflowY: "auto",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: "4px",
    padding: "8px 12px",
  },
  listRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
});

interface Props {
  rows: PolicyRow[];
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteAssignmentDialog({ rows, isSubmitting, onConfirm, onCancel }: Props) {
  const styles = useStyles();

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onCancel(); }}>
      <DialogSurface style={{ width: "480px", maxWidth: "95vw" }}>
        <DialogTitle>Delete Assignment{rows.length > 1 ? "s" : ""}</DialogTitle>
        <DialogBody>
          <DialogContent>
            <div className={styles.warning}>
              <WarningRegular fontSize={20} />
              <Text>
                The following {rows.length} assignment{rows.length !== 1 ? "s" : ""} will be
                permanently removed. This cannot be undone.
              </Text>
            </div>
            <div className={styles.list}>
              {rows.map((row, idx) => (
                <div key={idx} className={styles.listRow}>
                  <Text size={200} truncate>
                    {row.policyName}
                  </Text>
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    <Badge
                      appearance="tint"
                      color={
                        row.assignmentType === "Exclude"
                          ? "danger"
                          : row.assignmentType === "All Users"
                            ? "success"
                            : row.assignmentType === "All Devices"
                              ? "informative"
                              : "brand"
                      }
                      size="small"
                    >
                      {row.assignmentType}
                    </Badge>
                    {row.groupDisplayName && (
                      <Text size={200} style={{ color: "#666" }}>
                        {row.groupDisplayName}
                      </Text>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </DialogBody>
        <DialogActions>
          <Button appearance="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            style={{ backgroundColor: tokens.colorStatusDangerBackground3 }}
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Deleting..."
              : `Delete ${rows.length} assignment${rows.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
