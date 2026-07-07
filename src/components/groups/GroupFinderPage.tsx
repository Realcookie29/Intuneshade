import { useState, useMemo } from "react";
import {
  Button, Text, Spinner, Combobox, Option, Badge,
  Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { PersonSearch24Regular, SearchRegular, DismissRegular } from "@fluentui/react-icons";
import { useGroups, getGroupMap, getFilterMap } from "../../hooks/useGroups";
import { fetchPolicies } from "../../services/policiesService";
import { buildPolicyRows } from "../../utils/assignmentHelpers";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";
import type { PolicyType, PolicyRow } from "../../types/policyTypes";
import PageHeader from "../layout/PageHeader";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResultRow extends PolicyRow {
  policyType: PolicyType;
  policyTypeLabel: string;
  typeColor: string;
}

const TYPE_COLORS: Record<PolicyType, string> = {
  mobileApps:                         "#0078d4",
  configurationPolicies:              "#00bcf2",
  deviceConfigurations:               "#00b7c3",
  deviceCompliancePolicies:           "#107c10",
  groupPolicyConfigurations:          "#ca5010",
  deviceManagementScripts:            "#8764b8",
  deviceHealthScripts:                "#e3008c",
  windowsAutopilotDeploymentProfiles: "#038387",
  mobileAppConfigurations:            "#004e8c",
  deviceManagementIntents:            "#73aa24",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  hero: {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)",
    padding: "24px 32px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    flexWrap: "wrap",
  },
  heroLeft: { display: "flex", flexDirection: "column", gap: "4px" },
  heroTitle: { color: "white", fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: tokens.fontSizeBase300 },
  searchBar: {
    padding: "16px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  combobox: {
    minWidth: "320px",
    maxWidth: "480px",
  },
  statsRow: {
    display: "flex",
    gap: "24px",
    padding: "10px 24px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    alignItems: "center",
  },
  stat: { display: "flex", flexDirection: "column", gap: "1px" },
  statVal: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  statLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  content: {
    flex: 1,
    overflow: "auto",
  },
  table: {
    width: "100%",
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
  typeDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    display: "inline-block",
    marginRight: "6px",
    flexShrink: 0,
  },
  typeCell: {
    display: "flex",
    alignItems: "center",
    whiteSpace: "nowrap",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: tokens.colorNeutralForeground3,
    gap: "12px",
    padding: "48px",
  },
  progressWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "16px",
  },
  filterText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontStyle: "italic",
  },
  selectedGroupBadge: {
    maxWidth: "280px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

// ─── Badge for assignment type ────────────────────────────────────────────────

function AssignmentBadge({ type }: { type: PolicyRow["assignmentType"] }) {
  if (type === "No Assignment") return <Text style={{ color: "#999", fontStyle: "italic" }}>—</Text>;
  const colorMap: Record<string, "brand" | "success" | "warning" | "danger" | "informative"> = {
    Include: "brand",
    "All Users": "success",
    "All Devices": "informative",
    Exclude: "danger",
  };
  return <Badge color={colorMap[type] ?? "brand"} appearance="filled">{type}</Badge>;
}

// ─── Virtual group options ────────────────────────────────────────────────────

const VIRTUAL_GROUPS = [
  { id: "__allUsers__", displayName: "All Users (Virtual)" },
  { id: "__allDevices__", displayName: "All Devices (Virtual)" },
];

// ─── Main component ───────────────────────────────────────────────────────────

type ScanStatus = "idle" | "scanning" | "done";

export default function GroupFinderPage() {
  const styles = useStyles();
  const { groups, isLoading: groupsLoading } = useGroups();

  const [inputValue, setInputValue] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>("");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<PolicyType | null>(null);

  // Filtered group list based on input
  const filteredGroups = useMemo(() => {
    const q = inputValue.toLowerCase();
    const matched = q
      ? groups.filter((g) => g.displayName.toLowerCase().includes(q))
      : groups;
    const virtuals = q
      ? VIRTUAL_GROUPS.filter((g) => g.displayName.toLowerCase().includes(q))
      : VIRTUAL_GROUPS;
    return [...virtuals, ...matched.slice(0, 100)];
  }, [groups, inputValue]);

  const handleSelect = (_: unknown, data: { optionValue?: string; optionText?: string }) => {
    const id = data.optionValue ?? null;
    const name = data.optionText ?? "";
    setSelectedGroupId(id);
    setSelectedGroupName(name);
    setInputValue(name);
    setResults([]);
    setStatus("idle");
    setTypeFilter(null);
  };

  const handleSearch = async () => {
    if (!selectedGroupId) return;
    setStatus("scanning");
    setProgress(0);
    setResults([]);
    setTypeFilter(null);

    const gMap = getGroupMap();
    const fMap = getFilterMap();
    const all: ResultRow[] = [];

    for (let i = 0; i < POLICY_DEFINITIONS.length; i++) {
      const def = POLICY_DEFINITIONS[i];
      setPhase(`Scanning ${def.label}…`);
      try {
        const policies = await fetchPolicies(def.type);
        for (const policy of policies) {
          const rows = buildPolicyRows(policy, gMap, fMap);
          for (const row of rows) {
            if (row.assignmentType === "No Assignment") continue;

            const matches =
              (selectedGroupId === "__allUsers__" && row.assignmentType === "All Users") ||
              (selectedGroupId === "__allDevices__" && row.assignmentType === "All Devices") ||
              (row.groupId === selectedGroupId);

            if (matches) {
              all.push({
                ...row,
                policyType: def.type,
                policyTypeLabel: def.label,
                typeColor: TYPE_COLORS[def.type],
              });
            }
          }
        }
      } catch { /* skip */ }
      setProgress(Math.round(((i + 1) / POLICY_DEFINITIONS.length) * 100));
    }

    setResults(all);
    setStatus("done");
    setPhase("");
  };

  const handleClear = () => {
    setInputValue("");
    setSelectedGroupId(null);
    setSelectedGroupName("");
    setResults([]);
    setStatus("idle");
    setTypeFilter(null);
  };

  // Distinct policy types in results for filter chips
  const resultTypes = useMemo(() => {
    const types = new Set(results.map((r) => r.policyType));
    return POLICY_DEFINITIONS.filter((d) => types.has(d.type));
  }, [results]);

  const filteredResults = useMemo(() => {
    if (!typeFilter) return results;
    return results.filter((r) => r.policyType === typeFilter);
  }, [results, typeFilter]);

  const stats = useMemo(() => {
    const policies = new Set(results.map((r) => r.policyId)).size;
    const types = new Set(results.map((r) => r.policyType)).size;
    return { policies, types, assignments: results.length };
  }, [results]);

  return (
    <div className={styles.root}>
      {/* Hero */}
      <PageHeader
        eyebrow="Groups"
        title="Group Finder"
        subtitle="Find all policy assignments linked to a specific group or virtual target."
        icon={<PersonSearch24Regular />}
      />

      {/* Search bar */}
      <div className={styles.searchBar}>
        <Combobox
          className={styles.combobox}
          placeholder={groupsLoading ? "Loading groups…" : "Search for a group…"}
          value={inputValue}
          onInput={(e) => {
            setInputValue((e.target as HTMLInputElement).value);
            setSelectedGroupId(null);
          }}
          onOptionSelect={handleSelect}
          disabled={groupsLoading}
          freeform
        >
          {filteredGroups.map((g) => (
            <Option key={g.id} value={g.id} text={g.displayName}>
              {g.displayName}
            </Option>
          ))}
        </Combobox>

        <Button
          appearance="primary"
          icon={status === "scanning" ? <Spinner size="extra-tiny" /> : <SearchRegular />}
          disabled={!selectedGroupId || status === "scanning" || groupsLoading}
          onClick={handleSearch}
        >
          {status === "scanning" ? `${progress}%` : "Find Assignments"}
        </Button>

        {(selectedGroupId || inputValue) && (
          <Button
            appearance="subtle"
            icon={<DismissRegular />}
            onClick={handleClear}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Stats + type filter */}
      {status === "done" && (
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <Text className={styles.statVal}>{stats.assignments}</Text>
            <Text className={styles.statLabel}>Assignments</Text>
          </div>
          <div className={styles.stat}>
            <Text className={styles.statVal}>{stats.policies}</Text>
            <Text className={styles.statLabel}>Policies</Text>
          </div>
          <div className={styles.stat}>
            <Text className={styles.statVal}>{stats.types}</Text>
            <Text className={styles.statLabel}>Policy types</Text>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <Text className={styles.filterText}>Filter:</Text>
            <Button
              size="small"
              appearance={typeFilter === null ? "primary" : "subtle"}
              onClick={() => setTypeFilter(null)}
            >
              All
            </Button>
            {resultTypes.map((def) => (
              <Button
                key={def.type}
                size="small"
                appearance={typeFilter === def.type ? "primary" : "subtle"}
                onClick={() => setTypeFilter(typeFilter === def.type ? null : def.type)}
                style={{ paddingLeft: "8px" }}
              >
                <span
                  className={styles.typeDot}
                  style={{ backgroundColor: TYPE_COLORS[def.type] }}
                />
                {def.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>
        {status === "idle" && (
          <div className={styles.empty}>
            <PersonSearch24Regular style={{ fontSize: 48 }} />
            <Text size={500} weight="semibold">Select a group to get started</Text>
            <Text size={300}>
              Search for a group above, then click "Find Assignments" to see all policies assigned to it.
            </Text>
          </div>
        )}

        {status === "scanning" && (
          <div className={styles.progressWrap}>
            <Spinner size="large" />
            <Text size={400} weight="semibold">{phase}</Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              {progress}% — scanning {selectedGroupName}
            </Text>
          </div>
        )}

        {status === "done" && filteredResults.length === 0 && (
          <div className={styles.empty}>
            <Text size={500} weight="semibold">No assignments found</Text>
            <Text size={300}>
              "{selectedGroupName}" has no policy assignments
              {typeFilter ? ` for the selected policy type` : ""}.
            </Text>
          </div>
        )}

        {status === "done" && filteredResults.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <Table className={styles.table}>
              <TableHeader>
                <TableRow className={styles.headerRow}>
                  <TableHeaderCell className={styles.headerCell}>Policy Type</TableHeaderCell>
                  <TableHeaderCell className={styles.headerCell}>Policy Name</TableHeaderCell>
                  <TableHeaderCell className={styles.headerCell}>Assignment</TableHeaderCell>
                  <TableHeaderCell className={styles.headerCell}>Install Intent</TableHeaderCell>
                  <TableHeaderCell className={styles.headerCell}>Filter</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.map((row, idx) => (
                  <TableRow key={`${row.policyId}-${idx}`}>
                    <TableCell className={styles.cell}>
                      <span className={styles.typeCell}>
                        <span
                          className={styles.typeDot}
                          style={{ backgroundColor: row.typeColor }}
                        />
                        <Text size={200}>{row.policyTypeLabel}</Text>
                      </span>
                    </TableCell>
                    <TableCell className={styles.cell}>
                      <Text size={300} weight="semibold">{row.policyName}</Text>
                      {row.policyDescription && (
                        <Text
                          size={200}
                          style={{
                            display: "block",
                            color: tokens.colorNeutralForeground3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "360px",
                          }}
                        >
                          {row.policyDescription}
                        </Text>
                      )}
                    </TableCell>
                    <TableCell className={styles.cell}>
                      <AssignmentBadge type={row.assignmentType} />
                    </TableCell>
                    <TableCell className={styles.cell}>
                      {row.installIntent ? (
                        <Text size={200}>{row.installIntent}</Text>
                      ) : (
                        <Text style={{ color: "#bbb" }}>—</Text>
                      )}
                    </TableCell>
                    <TableCell className={styles.cell}>
                      {row.filterDisplayName ? (
                        <Text size={200}>
                          {row.filterDisplayName}
                          {row.filterType && (
                            <span style={{ color: tokens.colorNeutralForeground3, marginLeft: 4 }}>
                              ({row.filterType})
                            </span>
                          )}
                        </Text>
                      ) : (
                        <Text style={{ color: "#bbb" }}>—</Text>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
