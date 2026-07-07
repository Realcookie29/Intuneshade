import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions,
  Button, Text, Badge,
  makeStyles, tokens,
} from "@fluentui/react-components";
import type { PolicyRow } from "../../types/policyTypes";

const useStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    maxHeight: "420px",
    overflowY: "auto",
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  colHeader: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    padding: "6px 8px",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  assignmentRow: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "6px 8px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  onlyHere: {
    backgroundColor: tokens.colorStatusSuccessBackground1,
    border: `1px solid ${tokens.colorStatusSuccessForeground3}`,
  },
  missing: {
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    opacity: 0.45,
  },
  rowLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  noAssignments: { color: tokens.colorNeutralForeground3, fontStyle: "italic", fontSize: tokens.fontSizeBase200, padding: "6px 8px" },
  legend: {
    display: "flex",
    gap: "16px",
    paddingTop: "8px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  legendItem: { display: "flex", alignItems: "center", gap: "6px" },
});

interface AssignmentKey {
  label: string;        // display label for the row
  groupId: string | null;
  assignmentType: string;
  intent?: string;
}

function getAssignmentRows(rows: PolicyRow[]): AssignmentKey[] {
  return rows
    .filter((r) => r.assignmentType !== "No Assignment")
    .map((r) => ({
      label: r.assignmentType === "Include" || r.assignmentType === "Exclude"
        ? `${r.assignmentType}: ${r.groupDisplayName}`
        : r.assignmentType,
      groupId: r.groupId,
      assignmentType: r.assignmentType,
      intent: r.installIntent || undefined,
    }));
}

function keyOf(a: AssignmentKey): string {
  return `${a.assignmentType}::${a.groupId ?? "_"}::${a.intent ?? "_"}`;
}

interface Props {
  policyA: PolicyRow[];   // all rows for the first distinct policy
  policyB: PolicyRow[];   // all rows for the second distinct policy
  onClose: () => void;
}

export default function DiffDialog({ policyA, policyB, onClose }: Props) {
  const styles = useStyles();

  const nameA = policyA[0]?.policyName ?? "Policy A";
  const nameB = policyB[0]?.policyName ?? "Policy B";

  const rowsA = getAssignmentRows(policyA);
  const rowsB = getAssignmentRows(policyB);

  const keysA = new Set(rowsA.map(keyOf));
  const keysB = new Set(rowsB.map(keyOf));

  // Merge all unique keys from both sides for aligned display
  const allKeys = [...new Set([...keysA, ...keysB])];

  const findRow = (rows: AssignmentKey[], k: string) => rows.find((r) => keyOf(r) === k);

  return (
    <Dialog open>
      <DialogSurface style={{ maxWidth: 700 }}>
        <DialogTitle>Assignment Diff</DialogTitle>
        <DialogBody>
          <div className={styles.grid}>
            {/* Column A */}
            <div className={styles.column}>
              <Text className={styles.colHeader} title={nameA}>{nameA}</Text>
              {allKeys.length === 0 && <Text className={styles.noAssignments}>No assignments</Text>}
              {allKeys.map((k) => {
                const row = findRow(rowsA, k);
                const inBoth = keysB.has(k);
                return (
                  <div
                    key={k}
                    className={`${styles.assignmentRow} ${!row ? styles.missing : !inBoth ? styles.onlyHere : ""}`}
                  >
                    {row ? (
                      <>
                        <Text size={300}>{row.label}</Text>
                        {row.intent && <Text className={styles.rowLabel}>Intent: {row.intent}</Text>}
                      </>
                    ) : (
                      <Text size={300} style={{ fontStyle: "italic", color: tokens.colorNeutralForeground3 }}>
                        {findRow(rowsB, k)?.label ?? k} — not assigned
                      </Text>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Column B */}
            <div className={styles.column}>
              <Text className={styles.colHeader} title={nameB}>{nameB}</Text>
              {allKeys.length === 0 && <Text className={styles.noAssignments}>No assignments</Text>}
              {allKeys.map((k) => {
                const row = findRow(rowsB, k);
                const inBoth = keysA.has(k);
                return (
                  <div
                    key={k}
                    className={`${styles.assignmentRow} ${!row ? styles.missing : !inBoth ? styles.onlyHere : ""}`}
                  >
                    {row ? (
                      <>
                        <Text size={300}>{row.label}</Text>
                        {row.intent && <Text className={styles.rowLabel}>Intent: {row.intent}</Text>}
                      </>
                    ) : (
                      <Text size={300} style={{ fontStyle: "italic", color: tokens.colorNeutralForeground3 }}>
                        {findRow(rowsA, k)?.label ?? k} — not assigned
                      </Text>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <Badge color="success" size="small" />
              <Text size={200}>Only in this policy</Text>
            </div>
            <div className={styles.legendItem}>
              <Badge color="subtle" size="small" />
              <Text size={200}>Missing from this policy</Text>
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button appearance="primary" onClick={onClose}>Close</Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
