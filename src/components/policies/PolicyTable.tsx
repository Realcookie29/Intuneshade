import {
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TableSelectionCell,
  Badge,
  makeStyles,
  tokens,
  Text,
} from "@fluentui/react-components";
import type { PolicyRow, PolicyType } from "../../types/policyTypes";
import { getPolicyDefinition } from "../../utils/policyConfig";

const useStyles = makeStyles({
  root: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    minWidth: "700px",
  },
  headerRow: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "10px 12px",
    whiteSpace: "nowrap",
  },
  cell: {
    padding: "10px 12px",
    verticalAlign: "middle",
  },
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  rowHover: {
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      cursor: "pointer",
    },
  },
});

function AssignmentBadge({ type }: { type: PolicyRow["assignmentType"] }) {
  if (type === "No Assignment") return <Text style={{ color: "#999", fontStyle: "italic" }}>—</Text>;
  const colorMap: Record<string, "brand" | "success" | "warning" | "danger" | "informative"> = {
    Include: "brand",
    "All Users": "success",
    "All Devices": "informative",
    Exclude: "danger",
  };
  return (
    <Badge appearance="filled" color={colorMap[type] ?? "brand"}>
      {type}
    </Badge>
  );
}

function IntentBadge({ intent }: { intent: string }) {
  if (!intent) return <Text style={{ color: "#999" }}>—</Text>;
  const colorMap: Record<string, "brand" | "warning" | "danger" | "success"> = {
    required: "brand",
    available: "success",
    uninstall: "danger",
    availableWithoutEnrollment: "warning",
  };
  const labels: Record<string, string> = {
    required: "Required",
    available: "Available",
    uninstall: "Uninstall",
    availableWithoutEnrollment: "Avail. w/o Enrollment",
  };
  return (
    <Badge appearance="tint" color={colorMap[intent] ?? "brand"}>
      {labels[intent] ?? intent}
    </Badge>
  );
}

interface Props {
  rows: PolicyRow[];
  policyType: PolicyType;
  selectedRows: PolicyRow[];
  onSelectionChange: (rows: PolicyRow[]) => void;
}

export default function PolicyTable({ rows, policyType, selectedRows, onSelectionChange }: Props) {
  const styles = useStyles();
  const def = getPolicyDefinition(policyType);

  const isRowSelected = (row: PolicyRow) =>
    selectedRows.some(
      (r) =>
        r.policyId === row.policyId &&
        r.groupId === row.groupId &&
        r.assignmentType === row.assignmentType
    );

  const toggleRow = (row: PolicyRow) => {
    if (isRowSelected(row)) {
      onSelectionChange(
        selectedRows.filter(
          (r) =>
            !(
              r.policyId === row.policyId &&
              r.groupId === row.groupId &&
              r.assignmentType === row.assignmentType
            )
        )
      );
    } else {
      onSelectionChange([...selectedRows, row]);
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => isRowSelected(r));
  const someSelected = rows.some((r) => isRowSelected(r));

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(rows);
    }
  };

  return (
    <div className={styles.root}>
      <Table className={styles.table}>
        <TableHeader>
          <TableRow className={styles.headerRow}>
            <TableSelectionCell
              checked={allSelected ? true : someSelected ? "mixed" : false}
              onChange={toggleAll}
            />
            <TableHeaderCell className={styles.headerCell}>Policy Name</TableHeaderCell>
            <TableHeaderCell className={styles.headerCell}>Assignment</TableHeaderCell>
            <TableHeaderCell className={styles.headerCell}>Group</TableHeaderCell>
            {def.supportsFilters && (
              <TableHeaderCell className={styles.headerCell}>Filter</TableHeaderCell>
            )}
            {def.supportsIntent && (
              <TableHeaderCell className={styles.headerCell}>Intent</TableHeaderCell>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => {
            const selected = isRowSelected(row);
            return (
              <TableRow
                key={`${row.policyId}-${row.groupId ?? "none"}-${row.assignmentType}-${idx}`}
                className={`${styles.rowHover} ${selected ? styles.rowSelected : ""}`}
                onClick={() => toggleRow(row)}
              >
                <TableSelectionCell
                  checked={selected}
                  onChange={() => toggleRow(row)}
                  onClick={(e) => e.stopPropagation()}
                />
                <TableCell className={styles.cell}>
                  <Text weight={selected ? "semibold" : "regular"}>{row.policyName}</Text>
                </TableCell>
                <TableCell className={styles.cell}>
                  <AssignmentBadge type={row.assignmentType} />
                </TableCell>
                <TableCell className={styles.cell}>
                  {row.groupDisplayName || <Text style={{ color: "#999" }}>—</Text>}
                </TableCell>
                {def.supportsFilters && (
                  <TableCell className={styles.cell}>
                    {row.filterDisplayName ? (
                      <Text>
                        {row.filterDisplayName}{" "}
                        <Badge appearance="ghost" size="small">
                          {row.filterType}
                        </Badge>
                      </Text>
                    ) : (
                      <Text style={{ color: "#999" }}>—</Text>
                    )}
                  </TableCell>
                )}
                {def.supportsIntent && (
                  <TableCell className={styles.cell}>
                    <IntentBadge intent={row.installIntent} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
