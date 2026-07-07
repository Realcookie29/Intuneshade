import { useState, useMemo } from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Label,
  RadioGroup,
  Radio,
  Select,
  Combobox,
  Option,
  makeStyles,
  tokens,
  Text,
  Divider,
  Badge,
} from "@fluentui/react-components";
import type { PolicyDefinition, PolicyRow } from "../../types/policyTypes";
import type { PolicyType } from "../../types/policyTypes";
import type { AddAssignmentFormState, AppIntent } from "../../types/assignmentTypes";
import { useGroups } from "../../hooks/useGroups";

const useStyles = makeStyles({
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "16px",
  },
  row: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
  },
  halfField: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  policyList: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: "4px",
    padding: "8px 12px",
    marginBottom: "16px",
    maxHeight: "100px",
    overflowY: "auto",
  },
  combobox: {
    width: "100%",
  },
  select: {
    width: "100%",
  },
});

const INTENT_OPTIONS: { value: AppIntent; label: string }[] = [
  { value: "required", label: "Required" },
  { value: "available", label: "Available" },
  { value: "uninstall", label: "Uninstall" },
  { value: "availableWithoutEnrollment", label: "Available without enrollment" },
];

interface Props {
  policyType: PolicyType;
  policyDef: PolicyDefinition;
  selectedPolicies: PolicyRow[];
  isSubmitting: boolean;
  onConfirm: (form: AddAssignmentFormState) => void;
  onCancel: () => void;
}

export default function AddAssignmentDialog({
  policyDef,
  selectedPolicies,
  isSubmitting,
  onConfirm,
  onCancel,
}: Props) {
  const styles = useStyles();
  const { filters, search } = useGroups();

  const [groupQuery, setGroupQuery] = useState("");
  const [form, setForm] = useState<AddAssignmentFormState>({
    targetType: "group",
    assignmentDirection: "Include",
    selectedGroupId: null,
    selectedGroupName: null,
    filterId: null,
    filterDisplayName: null,
    filterType: null,
    intent: policyDef.supportsIntent ? "required" : null,
  });

  const filteredGroups = useMemo(() => search(groupQuery), [groupQuery, search]);

  const isValid =
    form.targetType === "allUsers" ||
    form.targetType === "allDevices" ||
    (form.targetType === "group" && !!form.selectedGroupId);

  const handleSubmit = () => {
    if (!isValid) return;
    onConfirm(form);
  };

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onCancel(); }}>
      <DialogSurface style={{ width: "520px", maxWidth: "95vw" }}>
        <DialogTitle>Add Group Assignment</DialogTitle>
        <DialogBody>
          <DialogContent>
            <Label weight="semibold">Applying to {selectedPolicies.length} policy(s):</Label>
            <div className={styles.policyList}>
              {selectedPolicies.map((p) => (
                <Text key={p.policyId} block size={200}>
                  {p.policyName}
                </Text>
              ))}
            </div>

            <Divider style={{ marginBottom: "16px" }} />

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
                layout="horizontal"
              >
                <Radio value="group" label="Security Group" />
                <Radio value="allUsers" label="All Users" />
                <Radio value="allDevices" label="All Devices" />
              </RadioGroup>
            </div>

            {form.targetType === "group" && (
              <div className={styles.field}>
                <Label weight="semibold" required>
                  Group
                </Label>
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
                    <Option value="" disabled>
                      No groups found
                    </Option>
                  )}
                </Combobox>
              </div>
            )}

            {form.targetType === "group" && (
              <div className={styles.field}>
                <Label weight="semibold">Assignment type</Label>
                <RadioGroup
                  value={form.assignmentDirection}
                  onChange={(_, d) =>
                    setForm((f) => ({
                      ...f,
                      assignmentDirection: d.value as "Include" | "Exclude",
                    }))
                  }
                  layout="horizontal"
                >
                  <Radio value="Include" label="Include" />
                  <Radio value="Exclude" label="Exclude" />
                </RadioGroup>
              </div>
            )}

            {policyDef.supportsFilters && form.assignmentDirection !== "Exclude" && (
              <div className={styles.row}>
                <div className={styles.halfField}>
                  <Label weight="semibold">
                    Assignment filter{" "}
                    <Badge appearance="ghost" size="small">
                      optional
                    </Badge>
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
                      <option key={f.id} value={f.id}>
                        {f.displayName}
                      </option>
                    ))}
                  </Select>
                </div>
                {form.filterId && (
                  <div className={styles.halfField}>
                    <Label weight="semibold">Filter mode</Label>
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
                  </div>
                )}
              </div>
            )}

            {policyDef.supportsIntent && (
              <div className={styles.field} style={{ marginTop: "16px" }}>
                <Label weight="semibold">Install intent</Label>
                <Select
                  className={styles.select}
                  value={form.intent ?? "required"}
                  onChange={(_, d) =>
                    setForm((f) => ({ ...f, intent: d.value as AppIntent }))
                  }
                >
                  {INTENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </DialogContent>
        </DialogBody>
        <DialogActions>
          <Button appearance="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? "Adding..." : "Add Assignment"}
          </Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
