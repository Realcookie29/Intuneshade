import { useState, useMemo, useCallback } from "react";
import {
  Button,
  Text,
  Label,
  RadioGroup,
  Radio,
  Select,
  Combobox,
  Option,
  makeStyles,
  tokens,
  Spinner,
  Badge,
  Checkbox,
  Divider,
  ProgressBar,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  ChevronRightRegular,
  ChevronDownRegular,
  AddRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
} from "@fluentui/react-icons";
import type { PolicyType } from "../../types/policyTypes";
import type { AddAssignmentFormState, AppIntent } from "../../types/assignmentTypes";
import { POLICY_DEFINITIONS } from "../../utils/policyConfig";
import { fetchPolicies } from "../../services/policiesService";
import { addAssignment } from "../../services/assignmentsService";
import { useGroups } from "../../hooks/useGroups";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PolicyItem {
  policyId: string;
  policyType: PolicyType;
  policyName: string;
  policyOdataType: string;
}

type SectionStatus = "idle" | "loading" | "loaded" | "error";

interface SectionState {
  status: SectionStatus;
  policies: PolicyItem[];
  error: string | null;
  expanded: boolean;
}

type AssignStatus = "pending" | "success" | "error";

// ─── Styles ──────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    display: "flex",
    height: "100%",
    overflow: "hidden",
    gap: "0",
  },
  // Left panel — assignment config
  configPanel: {
    width: "320px",
    flexShrink: 0,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    padding: "24px 20px",
    gap: "0",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  panelTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginBottom: "20px",
    display: "block",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "18px",
  },
  combobox: { width: "100%" },
  select: { width: "100%" },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  applyBtn: {
    marginTop: "auto",
    paddingTop: "16px",
  },
  // Right panel — policy selection
  selectionPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  selectionHeader: {
    padding: "16px 24px 12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  selectionScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 0",
  },
  // Section (accordion item)
  section: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 24px",
    cursor: "pointer",
    backgroundColor: "transparent",
    border: "none",
    width: "100%",
    textAlign: "left",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  sectionHeaderActive: {
    backgroundColor: tokens.colorNeutralBackground1Hover,
  },
  sectionChevron: { flexShrink: 0 },
  sectionLabel: { fontWeight: tokens.fontWeightSemibold, flex: 1 },
  sectionBadges: { display: "flex", gap: "6px", alignItems: "center" },
  policyList: {
    padding: "4px 24px 8px 52px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  policyRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "6px 8px",
    borderRadius: "4px",
    ":hover": { backgroundColor: tokens.colorNeutralBackground3 },
  },
  policyName: { flex: 1, fontSize: tokens.fontSizeBase300 },
  statusIcon: { flexShrink: 0 },
  // Footer
  footer: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  progress: { flex: 1 },
});

// ─── Intent options ───────────────────────────────────────────────────────────

const INTENT_OPTIONS: { value: AppIntent; label: string }[] = [
  { value: "required", label: "Required" },
  { value: "available", label: "Available" },
  { value: "uninstall", label: "Uninstall" },
  { value: "availableWithoutEnrollment", label: "Available without enrollment" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkAssignPage() {
  const styles = useStyles();
  const { filters, search } = useGroups();

  // Assignment form state
  const [form, setForm] = useState<AddAssignmentFormState>({
    targetType: "group",
    assignmentDirection: "Include",
    selectedGroupId: null,
    selectedGroupName: null,
    filterId: null,
    filterDisplayName: null,
    filterType: null,
    intent: "required",
  });
  const [groupQuery, setGroupQuery] = useState("");

  // Per-type section state
  const [sections, setSections] = useState<Partial<Record<PolicyType, SectionState>>>({});

  // Selected policies: key = `${policyType}::${policyId}`
  const [selected, setSelected] = useState<Map<string, PolicyItem>>(new Map());

  // Assign progress
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignProgress, setAssignProgress] = useState<Map<string, AssignStatus>>(new Map());
  const [assignDone, setAssignDone] = useState(false);

  // ── Section helpers ─────────────────────────────────────────────────────────

  const toggleSection = useCallback(async (type: PolicyType) => {
    setSections((prev) => {
      const existing = prev[type];
      // If already loaded, just toggle expanded
      if (existing?.status === "loaded" || existing?.status === "error") {
        return { ...prev, [type]: { ...existing, expanded: !existing.expanded } };
      }
      // Start loading
      return { ...prev, [type]: { status: "loading", policies: [], error: null, expanded: true } };
    });

    // Only fetch if not yet loaded
    setSections((prev) => {
      const s = prev[type];
      if (!s || s.status !== "loading") return prev;
      return prev; // will fetch below
    });

    setSections((prev) => {
      const s = prev[type];
      if (s?.status !== "loading") return prev; // already handled
      return prev;
    });

    // Fetch outside of setState
    const current = sections[type];
    if (current?.status === "loaded" || current?.status === "error") return;

    try {
      const policies = await fetchPolicies(type);
      const items: PolicyItem[] = [];
      const seen = new Set<string>();
      for (const p of policies) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          items.push({
            policyId: p.id,
            policyType: type,
            policyName: p.displayName ?? p.name ?? "(No name)",
            policyOdataType: p["@odata.type"] ?? "",
          });
        }
      }
      setSections((prev) => ({
        ...prev,
        [type]: { status: "loaded", policies: items, error: null, expanded: true },
      }));
    } catch (e) {
      setSections((prev) => ({
        ...prev,
        [type]: {
          status: "error",
          policies: [],
          error: (e as Error).message,
          expanded: true,
        },
      }));
    }
  }, [sections]);

  const togglePolicy = useCallback((item: PolicyItem, checked: boolean) => {
    const key = `${item.policyType}::${item.policyId}`;
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked) next.set(key, item);
      else next.delete(key);
      return next;
    });
  }, []);

  const toggleAllInSection = useCallback((type: PolicyType, policies: PolicyItem[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of policies) {
        const key = `${type}::${p.policyId}`;
        if (checked) next.set(key, p);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setSelected(new Map()), []);

  // ── Apply assignment ────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    const items = Array.from(selected.values());
    if (items.length === 0) return;

    setIsAssigning(true);
    setAssignDone(false);
    const progress = new Map<string, AssignStatus>();
    for (const item of items) {
      progress.set(`${item.policyType}::${item.policyId}`, "pending");
    }
    setAssignProgress(new Map(progress));

    for (const item of items) {
      const key = `${item.policyType}::${item.policyId}`;
      const def = POLICY_DEFINITIONS.find((d) => d.type === item.policyType)!;

      // Build a form adapted to this policy type's capabilities
      const adaptedForm: AddAssignmentFormState = {
        ...form,
        // Only pass filter if the type supports it
        filterId: def.supportsFilters ? form.filterId : null,
        filterDisplayName: def.supportsFilters ? form.filterDisplayName : null,
        filterType: def.supportsFilters ? form.filterType : null,
        // Only pass intent if the type supports it
        intent: def.supportsIntent ? form.intent : null,
      };

      try {
        await addAssignment(item.policyType, item.policyId, adaptedForm, item.policyOdataType);
        setAssignProgress((prev) => new Map(prev).set(key, "success"));
      } catch {
        setAssignProgress((prev) => new Map(prev).set(key, "error"));
      }
    }

    setIsAssigning(false);
    setAssignDone(true);
  }, [selected, form]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const filteredGroups = useMemo(() => search(groupQuery), [groupQuery, search]);
  const selectedCount = selected.size;
  const isFormValid =
    form.targetType === "allUsers" ||
    form.targetType === "allDevices" ||
    (form.targetType === "group" && !!form.selectedGroupId);

  const successCount = assignDone
    ? Array.from(assignProgress.values()).filter((s) => s === "success").length
    : 0;
  const errorCount = assignDone
    ? Array.from(assignProgress.values()).filter((s) => s === "error").length
    : 0;
  const doneCount = assignDone
    ? Array.from(assignProgress.values()).filter((s) => s !== "pending").length
    : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {/* ── Left: Config ── */}
      <div className={styles.configPanel}>
        <Text className={styles.panelTitle}>Assignment Settings</Text>

        {/* Target type */}
        <div className={styles.field}>
          <Label weight="semibold">Target</Label>
          <RadioGroup
            value={form.targetType}
            onChange={(_, d) => {
              const t = d.value as AddAssignmentFormState["targetType"];
              setForm((f) => ({
                ...f,
                targetType: t,
                assignmentDirection: t !== "group" ? "Include" : f.assignmentDirection,
                selectedGroupId: t !== "group" ? null : f.selectedGroupId,
                selectedGroupName: t !== "group" ? null : f.selectedGroupName,
              }));
            }}
          >
            <Radio value="group" label="Security Group" />
            <Radio value="allUsers" label="All Users" />
            <Radio value="allDevices" label="All Devices" />
          </RadioGroup>
        </div>

        {/* Group picker */}
        {form.targetType === "group" && (
          <div className={styles.field}>
            <Label weight="semibold" required>Group</Label>
            <Combobox
              className={styles.combobox}
              placeholder="Search security groups..."
              value={form.selectedGroupName ?? groupQuery}
              onChange={(e) => {
                setGroupQuery(e.target.value);
                setForm((f) => ({ ...f, selectedGroupId: null, selectedGroupName: null }));
              }}
              onOptionSelect={(_, d) => {
                setForm((f) => ({
                  ...f,
                  selectedGroupId: d.optionValue ?? null,
                  selectedGroupName: d.optionText ?? null,
                }));
                setGroupQuery("");
              }}
            >
              {filteredGroups.slice(0, 50).map((g) => (
                <Option key={g.id} value={g.id} text={g.displayName}>
                  {g.displayName}
                </Option>
              ))}
              {filteredGroups.length === 0 && (
                <Option value="" disabled>No groups found</Option>
              )}
            </Combobox>
          </div>
        )}

        {/* Assignment direction */}
        {form.targetType === "group" && (
          <div className={styles.field}>
            <Label weight="semibold">Assignment type</Label>
            <RadioGroup
              value={form.assignmentDirection}
              onChange={(_, d) =>
                setForm((f) => ({ ...f, assignmentDirection: d.value as "Include" | "Exclude" }))
              }
              layout="horizontal"
            >
              <Radio value="Include" label="Include" />
              <Radio value="Exclude" label="Exclude" />
            </RadioGroup>
          </div>
        )}

        <Divider style={{ margin: "4px 0 18px" }} />

        {/* Filter */}
        {form.assignmentDirection !== "Exclude" && (
          <div className={styles.field}>
            <Label weight="semibold">
              Assignment filter{" "}
              <Badge appearance="ghost" size="small">optional</Badge>
            </Label>
            <Select
              className={styles.select}
              value={form.filterId ?? ""}
              onChange={(_, d) => {
                const filter = filters.find((f) => f.id === d.value);
                setForm((f) => ({
                  ...f,
                  filterId: d.value || null,
                  filterDisplayName: filter?.displayName ?? null,
                }));
              }}
            >
              <option value="">None</option>
              {filters.map((f) => (
                <option key={f.id} value={f.id}>{f.displayName}</option>
              ))}
            </Select>
            {form.filterId && (
              <RadioGroup
                value={form.filterType ?? "include"}
                onChange={(_, d) =>
                  setForm((f) => ({ ...f, filterType: d.value as "include" | "exclude" }))
                }
                layout="horizontal"
              >
                <Radio value="include" label="Include" />
                <Radio value="exclude" label="Exclude" />
              </RadioGroup>
            )}
            <Text className={styles.hint}>Only applied to policy types that support filters</Text>
          </div>
        )}

        {/* Intent */}
        <div className={styles.field}>
          <Label weight="semibold">Install intent</Label>
          <Select
            className={styles.select}
            value={form.intent ?? "required"}
            onChange={(_, d) => setForm((f) => ({ ...f, intent: d.value as AppIntent }))}
          >
            {INTENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Text className={styles.hint}>Only applied to Applications</Text>
        </div>
      </div>

      {/* ── Right: Policy selection + footer ── */}
      <div className={styles.selectionPanel}>
        <div className={styles.selectionHeader}>
          <Text weight="semibold" size={400}>
            Select policies to assign{" "}
            {selectedCount > 0 && (
              <Badge appearance="filled" color="brand">{selectedCount} selected</Badge>
            )}
          </Text>
          {selectedCount > 0 && (
            <Button appearance="subtle" size="small" onClick={clearAll}>
              Clear all
            </Button>
          )}
        </div>

        <div className={styles.selectionScroll}>
          {POLICY_DEFINITIONS.map((def) => {
            const section = sections[def.type];
            const isExpanded = section?.expanded ?? false;
            const isLoading = section?.status === "loading";
            const policies = section?.policies ?? [];
            const selectedInSection = policies.filter(
              (p) => selected.has(`${def.type}::${p.policyId}`)
            ).length;
            const allInSectionSelected =
              policies.length > 0 && selectedInSection === policies.length;
            const someInSectionSelected = selectedInSection > 0 && !allInSectionSelected;

            return (
              <div key={def.type} className={styles.section}>
                <button
                  className={`${styles.sectionHeader} ${isExpanded ? styles.sectionHeaderActive : ""}`}
                  onClick={() => toggleSection(def.type)}
                >
                  <span className={styles.sectionChevron}>
                    {isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
                  </span>
                  <Text className={styles.sectionLabel}>{def.label}</Text>
                  <span className={styles.sectionBadges}>
                    {isLoading && <Spinner size="extra-tiny" />}
                    {section?.status === "loaded" && (
                      <Badge appearance="ghost" size="small">{policies.length}</Badge>
                    )}
                    {selectedInSection > 0 && (
                      <Badge appearance="filled" color="brand" size="small">
                        {selectedInSection}
                      </Badge>
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className={styles.policyList}>
                    {isLoading && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3, padding: "4px 0" }}>
                        Loading...
                      </Text>
                    )}

                    {section?.status === "error" && (
                      <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>
                        {section.error}
                      </Text>
                    )}

                    {section?.status === "loaded" && policies.length === 0 && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        No {def.label.toLowerCase()} found
                      </Text>
                    )}

                    {section?.status === "loaded" && policies.length > 0 && (
                      <>
                        {/* Select all for this section */}
                        <div className={styles.policyRow}>
                          <Checkbox
                            checked={allInSectionSelected ? true : someInSectionSelected ? "mixed" : false}
                            onChange={(_, d) => toggleAllInSection(def.type, policies, !!d.checked)}
                            label={<Text size={200} weight="semibold">Select all ({policies.length})</Text>}
                          />
                        </div>
                        <Divider style={{ margin: "2px 0 4px" }} />

                        {/* Individual policies */}
                        {policies.map((p) => {
                          const key = `${def.type}::${p.policyId}`;
                          const status = assignProgress.get(key);
                          return (
                            <div key={key} className={styles.policyRow}>
                              <Checkbox
                                checked={selected.has(key)}
                                onChange={(_, d) => togglePolicy(p, !!d.checked)}
                                disabled={isAssigning}
                                label={<Text className={styles.policyName}>{p.policyName}</Text>}
                              />
                              {status === "success" && (
                                <CheckmarkCircleRegular
                                  className={styles.statusIcon}
                                  style={{ color: tokens.colorStatusSuccessForeground1 }}
                                />
                              )}
                              {status === "error" && (
                                <ErrorCircleRegular
                                  className={styles.statusIcon}
                                  style={{ color: tokens.colorStatusDangerForeground1 }}
                                />
                              )}
                              {status === "pending" && isAssigning && (
                                <Spinner size="extra-tiny" className={styles.statusIcon} />
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          {isAssigning && (
            <div className={styles.progress}>
              <ProgressBar
                value={doneCount / selectedCount}
                shape="rounded"
              />
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: "4px", display: "block" }}>
                Assigning {doneCount} / {selectedCount}...
              </Text>
            </div>
          )}

          {assignDone && !isAssigning && (
            <div className={styles.progress}>
              {successCount > 0 && (
                <MessageBar intent="success">
                  <MessageBarBody>{successCount} assignment{successCount !== 1 ? "s" : ""} applied successfully.</MessageBarBody>
                </MessageBar>
              )}
              {errorCount > 0 && (
                <MessageBar intent="error">
                  <MessageBarBody>{errorCount} assignment{errorCount !== 1 ? "s" : ""} failed — check individual rows above.</MessageBarBody>
                </MessageBar>
              )}
            </div>
          )}

          {!isAssigning && (
            <Button
              appearance="primary"
              icon={<AddRegular />}
              disabled={selectedCount === 0 || !isFormValid || isAssigning}
              onClick={handleApply}
              style={{ flexShrink: 0 }}
            >
              Assign to {selectedCount} {selectedCount === 1 ? "policy" : "policies"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
