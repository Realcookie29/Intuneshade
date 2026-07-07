import { useState } from "react";
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Button, Input, Textarea, Dropdown, Option, Field, Spinner, Text,
  MessageBar, MessageBarBody, makeStyles, tokens,
} from "@fluentui/react-components";
import type {
  AssignmentFilter, AssignmentFilterInput, AssignmentFilterManagementType,
} from "../../types/graphTypes";
import { createFilter, updateFilter } from "../../services/filtersService";

const PLATFORMS: { value: string; label: string }[] = [
  { value: "windows10AndLater", label: "Windows 10 and later" },
  { value: "iOS", label: "iOS/iPadOS" },
  { value: "macOS", label: "macOS" },
  { value: "android", label: "Android (device administrator)" },
  { value: "androidWorkProfile", label: "Android Enterprise (work profile)" },
  { value: "androidAOSP", label: "Android (AOSP)" },
];

const MANAGEMENT_TYPES: { value: AssignmentFilterManagementType; label: string }[] = [
  { value: "devices", label: "Manage devices" },
  { value: "apps", label: "Manage apps" },
];

const RULE_EXAMPLES = [
  '(device.manufacturer -eq "Microsoft")',
  '(device.osVersion -startsWith "10.0.22")',
  '(device.deviceName -contains "LAPTOP")',
  '(device.model -notEq "Virtual Machine")',
];

const useStyles = makeStyles({
  surface: { maxWidth: "620px" },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  examples: {
    marginTop: "6px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  exampleRow: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    cursor: "pointer",
    padding: "1px 4px",
    borderRadius: "3px",
    ":hover": { backgroundColor: tokens.colorNeutralBackground3 },
  },
  ruleArea: { fontFamily: "monospace" },
});

interface Props {
  /** null = create mode; otherwise edit that filter */
  filter: AssignmentFilter | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function FilterEditDialog({ filter, onSaved, onCancel }: Props) {
  const styles = useStyles();
  const isEdit = filter !== null;

  const [displayName, setDisplayName] = useState(filter?.displayName ?? "");
  const [description, setDescription] = useState(filter?.description ?? "");
  const [platform, setPlatform] = useState<string>(filter?.platform ?? "windows10AndLater");
  const [managementType, setManagementType] = useState<AssignmentFilterManagementType>(
    filter?.assignmentFilterManagementType ?? "devices"
  );
  const [rule, setRule] = useState(filter?.rule ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platformLabel = PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
  const mgmtLabel = MANAGEMENT_TYPES.find((m) => m.value === managementType)?.label ?? managementType;

  const canSave = displayName.trim().length > 0 && rule.trim().length > 0 && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateFilter(filter!.id, {
          displayName: displayName.trim(),
          description: description.trim(),
          rule: rule.trim(),
        });
      } else {
        const input: AssignmentFilterInput = {
          displayName: displayName.trim(),
          description: description.trim(),
          platform,
          rule: rule.trim(),
          assignmentFilterManagementType: managementType,
        };
        await createFilter(input);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open && !saving) onCancel(); }}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>{isEdit ? "Edit filter" : "New assignment filter"}</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            <Field label="Name" required>
              <Input
                value={displayName}
                onChange={(_, d) => setDisplayName(d.value)}
                placeholder="e.g. Windows physical devices"
              />
            </Field>

            <Field label="Description">
              <Input
                value={description}
                onChange={(_, d) => setDescription(d.value)}
                placeholder="Optional"
              />
            </Field>

            <div style={{ display: "flex", gap: "12px" }}>
              <Field label="Platform" required style={{ flex: 1 }}>
                <Dropdown
                  value={platformLabel}
                  selectedOptions={[platform]}
                  disabled={isEdit}
                  onOptionSelect={(_, d) => d.optionValue && setPlatform(d.optionValue)}
                >
                  {PLATFORMS.map((p) => (
                    <Option key={p.value} value={p.value} text={p.label}>{p.label}</Option>
                  ))}
                </Dropdown>
              </Field>

              <Field label="Filter type" required style={{ flex: 1 }}>
                <Dropdown
                  value={mgmtLabel}
                  selectedOptions={[managementType]}
                  disabled={isEdit}
                  onOptionSelect={(_, d) =>
                    d.optionValue && setManagementType(d.optionValue as AssignmentFilterManagementType)
                  }
                >
                  {MANAGEMENT_TYPES.map((m) => (
                    <Option key={m.value} value={m.value} text={m.label}>{m.label}</Option>
                  ))}
                </Dropdown>
              </Field>
            </div>
            {isEdit && (
              <Text className={styles.hint}>
                Platform and filter type can't be changed after a filter is created.
              </Text>
            )}

            <Field label="Rule syntax" required>
              <Textarea
                className={styles.ruleArea}
                value={rule}
                onChange={(_, d) => setRule(d.value)}
                placeholder='(device.manufacturer -eq "Microsoft")'
                rows={3}
                resize="vertical"
              />
            </Field>
            <div>
              <Text className={styles.hint}>Click an example to insert it:</Text>
              <div className={styles.examples}>
                {RULE_EXAMPLES.map((ex) => (
                  <span key={ex} className={styles.exampleRow} onClick={() => setRule(ex)}>
                    {ex}
                  </span>
                ))}
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button
              appearance="primary"
              onClick={handleSave}
              disabled={!canSave}
              icon={saving ? <Spinner size="tiny" /> : undefined}
            >
              {isEdit ? "Save changes" : "Create filter"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
