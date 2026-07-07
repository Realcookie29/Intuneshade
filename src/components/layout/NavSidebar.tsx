import { useEffect, useMemo, useState } from "react";
import { makeStyles, mergeClasses, tokens, Text, Input } from "@fluentui/react-components";
import {
  AppsList24Regular,
  Settings24Regular,
  DeviceEq24Regular,
  ShieldCheckmark24Regular,
  Diversity24Regular,
  Code24Regular,
  HeartPulse24Regular,
  VehicleCar24Regular,
  AppsAddIn24Regular,
  Clipboard24Regular,
  LayerDiagonalSparkle24Regular,
  AlertRegular,
  Share24Regular,
  ClipboardCheckmark24Regular,
  PersonSearch24Regular,
  DocumentSearch24Regular,
  Filter24Regular,
  ArrowSyncCircle24Regular,
  History24Regular,
  PeopleTeam24Regular,
  Home24Regular,
  ArrowSwap24Regular,
  DocumentTable24Regular,
  Tag24Regular,
  ShieldTask24Regular,
  ChevronRight16Regular,
  SearchRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import type { PolicyType } from "../../types/policyTypes";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";

/** All non-policy-type "tool" pages selectable from the sidebar. */
export type ToolView =
  | "home"
  | "bulk"
  | "conflict"
  | "map"
  | "report"
  | "deviceCompliance"
  | "assignmentReport"
  | "groupFinder"
  | "settingsSearch"
  | "filters"
  | "backup"
  | "audit"
  | "groupMembership"
  | "autopilotTags"
  | "compareDevice"
  | "compareDeviceUser";

interface ToolDef { key: ToolView; label: string; icon: React.ReactElement }
interface GroupDef { id: string; label: string; tools: ToolDef[] }

/** Tools organised into collapsible functional groups to keep the rail tidy. */
const GROUPS: GroupDef[] = [
  {
    id: "insights",
    label: "Reports & Insights",
    tools: [
      { key: "assignmentReport", label: "Assignment Report", icon: <DocumentTable24Regular /> },
      { key: "map", label: "Assignment Matrix", icon: <Share24Regular /> },
      { key: "deviceCompliance", label: "Device Compliance", icon: <ShieldTask24Regular /> },
      { key: "report", label: "Compliance Report", icon: <ClipboardCheckmark24Regular /> },
      { key: "conflict", label: "Conflict Detection", icon: <AlertRegular /> },
    ],
  },
  {
    id: "compare",
    label: "Compare",
    tools: [
      { key: "compareDevice", label: "Device Compare", icon: <ArrowSwap24Regular /> },
      { key: "compareDeviceUser", label: "Device + User Compare", icon: <ArrowSwap24Regular /> },
    ],
  },
  {
    id: "discover",
    label: "Discover",
    tools: [
      { key: "groupFinder", label: "Group Finder", icon: <PersonSearch24Regular /> },
      { key: "settingsSearch", label: "Settings Search", icon: <DocumentSearch24Regular /> },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    tools: [
      { key: "bulk", label: "Bulk Assign", icon: <LayerDiagonalSparkle24Regular /> },
      { key: "groupMembership", label: "Group Membership", icon: <PeopleTeam24Regular /> },
      { key: "autopilotTags", label: "Autopilot Group Tags", icon: <Tag24Regular /> },
      { key: "filters", label: "Assignment Filters", icon: <Filter24Regular /> },
    ],
  },
  {
    id: "govern",
    label: "Governance",
    tools: [
      { key: "backup", label: "Backup & Restore", icon: <ArrowSyncCircle24Regular /> },
      { key: "audit", label: "Audit History", icon: <History24Regular /> },
    ],
  },
];

const POLICY_GROUP_ID = "policyTypes";

const ICONS: Record<PolicyType, React.ReactElement> = {
  mobileApps: <AppsList24Regular />,
  configurationPolicies: <Settings24Regular />,
  deviceConfigurations: <DeviceEq24Regular />,
  deviceCompliancePolicies: <ShieldCheckmark24Regular />,
  groupPolicyConfigurations: <Diversity24Regular />,
  deviceManagementScripts: <Code24Regular />,
  deviceHealthScripts: <HeartPulse24Regular />,
  windowsAutopilotDeploymentProfiles: <VehicleCar24Regular />,
  mobileAppConfigurations: <AppsAddIn24Regular />,
  deviceManagementIntents: <Clipboard24Regular />,
};

const COLLAPSE_KEY = "nav.collapsedGroups";

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  // First run: start tidy — collapse everything except the reports group.
  return new Set(["compare", "discover", "manage", "govern", POLICY_GROUP_ID]);
}

const useStyles = makeStyles({
  root: {
    width: "236px",
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    padding: "12px 0 16px",
    overflowY: "auto",
  },
  filterWrap: { padding: "4px 12px 8px" },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "9px 16px",
    cursor: "pointer",
    border: "none",
    borderLeft: "3px solid transparent",
    background: "transparent",
    width: "100%",
    textAlign: "left",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    transition: "background 0.1s",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemNested: { paddingLeft: "26px" },
  itemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    borderLeft: `3px solid ${tokens.colorBrandForeground1}`,
    ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "10px 14px 6px",
    color: tokens.colorNeutralForeground3,
    ":hover": { color: tokens.colorNeutralForeground1 },
  },
  groupLabel: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "inherit",
    flex: 1,
    textAlign: "left",
  },
  chevron: {
    transition: "transform 0.15s ease",
    flexShrink: 0,
    fontSize: "16px",
  },
  chevronOpen: { transform: "rotate(90deg)" },
  count: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
    fontFamily: tokens.fontFamilyMonospace,
  },
  icon: { flexShrink: 0, display: "flex", alignItems: "center" },
  divider: { height: "1px", background: tokens.colorNeutralStroke2, margin: "8px 12px" },
  emptyHint: {
    padding: "10px 16px",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground4,
  },
});

interface Props {
  selectedType: PolicyType | null;
  activeTool: ToolView | null;
  onSelectType: (type: PolicyType) => void;
  onSelectTool: (tool: ToolView) => void;
}

export default function NavSidebar({ selectedType, activeTool, onSelectType, onSelectTool }: Props) {
  const styles = useStyles();
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const filtering = q.length > 0;

  // Which group owns the active view — used to auto-expand it.
  const activeGroupId = useMemo(() => {
    if (activeTool && activeTool !== "home") {
      const g = GROUPS.find((grp) => grp.tools.some((t) => t.key === activeTool));
      if (g) return g.id;
    }
    if (selectedType) return POLICY_GROUP_ID;
    return null;
  }, [activeTool, selectedType]);

  // Ensure the active group is always open so the highlighted item is visible.
  useEffect(() => {
    if (activeGroupId && collapsed.has(activeGroupId)) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(activeGroupId);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  const persist = (next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  };

  const toggleGroup = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    persist(next);
  };

  const matches = (label: string) => label.toLowerCase().includes(q);

  // When filtering, force groups open and only show matching items.
  const isOpen = (id: string) => filtering || !collapsed.has(id);

  const renderToolButton = (tool: ToolDef) => (
    <button
      key={tool.key}
      className={mergeClasses(
        styles.item,
        styles.itemNested,
        activeTool === tool.key && styles.itemActive,
      )}
      onClick={() => onSelectTool(tool.key)}
    >
      <span className={styles.icon}>{tool.icon}</span>
      {tool.label}
    </button>
  );

  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    shown: filtering ? g.tools.filter((t) => matches(t.label)) : g.tools,
  })).filter((g) => !filtering || g.shown.length > 0);

  const visiblePolicies = filtering
    ? POLICY_DEFINITIONS.filter((d) => matches(d.label))
    : POLICY_DEFINITIONS;

  const nothingMatches = filtering && visibleGroups.length === 0 && visiblePolicies.length === 0;

  return (
    <nav className={styles.root}>
      <button
        className={mergeClasses(styles.item, activeTool === "home" && styles.itemActive)}
        onClick={() => onSelectTool("home")}
      >
        <span className={styles.icon}><Home24Regular /></span>
        Home
      </button>

      <div className={styles.filterWrap}>
        <Input
          size="small"
          placeholder="Filter menu…"
          value={filter}
          onChange={(_, d) => setFilter(d.value)}
          contentBefore={<SearchRegular />}
          contentAfter={
            filter ? (
              <DismissRegular
                style={{ cursor: "pointer" }}
                onClick={() => setFilter("")}
                aria-label="Clear filter"
              />
            ) : undefined
          }
          style={{ width: "100%" }}
        />
      </div>

      {nothingMatches && <Text className={styles.emptyHint}>No menu items match "{filter}".</Text>}

      {visibleGroups.map((g) => (
        <div key={g.id}>
          <button className={styles.groupHeader} onClick={() => toggleGroup(g.id)}>
            <ChevronRight16Regular
              className={mergeClasses(styles.chevron, isOpen(g.id) && styles.chevronOpen)}
            />
            <Text className={styles.groupLabel}>{g.label}</Text>
            <span className={styles.count}>{g.tools.length}</span>
          </button>
          {isOpen(g.id) && g.shown.map(renderToolButton)}
        </div>
      ))}

      <div className={styles.divider} />

      <div>
        <button className={styles.groupHeader} onClick={() => toggleGroup(POLICY_GROUP_ID)}>
          <ChevronRight16Regular
            className={mergeClasses(styles.chevron, isOpen(POLICY_GROUP_ID) && styles.chevronOpen)}
          />
          <Text className={styles.groupLabel}>Policy Types</Text>
          <span className={styles.count}>{POLICY_DEFINITIONS.length}</span>
        </button>
        {isOpen(POLICY_GROUP_ID) && visiblePolicies.map((def) => (
          <button
            key={def.type}
            className={mergeClasses(
              styles.item,
              styles.itemNested,
              selectedType === def.type && activeTool === null && styles.itemActive,
            )}
            onClick={() => onSelectType(def.type)}
          >
            <span className={styles.icon}>{ICONS[def.type]}</span>
            {def.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
