import { Button, Input, Spinner, makeStyles, tokens } from "@fluentui/react-components";
import {
  AddRegular,
  DeleteRegular,
  ArrowClockwiseRegular,
  SearchRegular,
  SparkleRegular,
  CodeRegular,
  CopyRegular,
  ToggleLeftRegular,
  ArrowDownloadRegular,
  ArrowUploadRegular,
  TableRegular,
} from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 0 12px",
    flexWrap: "wrap",
  },
  search: {
    width: "280px",
  },
  divider: {
    width: "1px",
    height: "24px",
    backgroundColor: tokens.colorNeutralStroke2,
    margin: "0 4px",
  },
});

interface Props {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onAnalyze: () => void;
  onScriptGenerator: () => void;
  onDeletePolicy: () => void;
  onClone: () => void;
  onEnableDisable: () => void;
  onExport: () => void;
  onImport: () => void;
  onDiff: () => void;
  canAdd: boolean;
  canDelete: boolean;
  canAnalyze: boolean;
  canDeletePolicy: boolean;
  canClone: boolean;
  canEnableDisable: boolean;
  canExport: boolean;
  canDiff: boolean;
  isLoading: boolean;
  isExporting: boolean;
}

export default function PolicyTableToolbar({
  searchQuery,
  onSearchChange,
  onAdd,
  onDelete,
  onRefresh,
  onAnalyze,
  onScriptGenerator,
  onDeletePolicy,
  onClone,
  onEnableDisable,
  onExport,
  onImport,
  onDiff,
  canAdd,
  canDelete,
  canAnalyze,
  canDeletePolicy,
  canClone,
  canEnableDisable,
  canExport,
  canDiff,
  isLoading,
  isExporting,
}: Props) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <Input
        className={styles.search}
        placeholder="Search name or group..."
        value={searchQuery}
        onChange={(_, d) => onSearchChange(d.value)}
        contentBefore={<SearchRegular />}
        disabled={isLoading}
      />
      <div className={styles.divider} />
      <Button
        appearance="primary"
        icon={<AddRegular />}
        disabled={!canAdd || isLoading}
        onClick={onAdd}
      >
        Add Assignment
      </Button>
      <Button
        appearance="subtle"
        icon={<DeleteRegular />}
        disabled={!canDelete || isLoading}
        onClick={onDelete}
      >
        Delete Assignment
      </Button>
      <div className={styles.divider} />
      <Button
        appearance="subtle"
        icon={<SparkleRegular />}
        disabled={!canAnalyze || isLoading}
        onClick={onAnalyze}
        title="Analyze selected policies with AI"
      >
        Analyze
      </Button>
      <Button
        appearance="subtle"
        icon={<CodeRegular />}
        disabled={isLoading}
        onClick={onScriptGenerator}
        title="Generate a PowerShell or Graph API script"
      >
        Script
      </Button>
      <div className={styles.divider} />
      <Button
        appearance="subtle"
        icon={<DeleteRegular />}
        disabled={!canDeletePolicy || isLoading}
        onClick={onDeletePolicy}
        title="Permanently delete selected policies from the tenant"
        style={{ color: canDeletePolicy ? tokens.colorStatusDangerForeground1 : undefined }}
      >
        Delete Policy
      </Button>
      <Button
        appearance="subtle"
        icon={<CopyRegular />}
        disabled={!canClone || isLoading}
        onClick={onClone}
        title="Clone selected policies"
      >
        Clone
      </Button>
      <Button
        appearance="subtle"
        icon={<ToggleLeftRegular />}
        disabled={!canEnableDisable || isLoading}
        onClick={onEnableDisable}
        title="Enable or disable selected policies (Settings Catalog only)"
      >
        Enable/Disable
      </Button>
      <Button
        appearance="subtle"
        icon={isExporting ? undefined : <ArrowDownloadRegular />}
        disabled={!canExport || isLoading || isExporting}
        onClick={onExport}
        title="Export full policy content to JSON (importable into another tenant)"
      >
        {isExporting ? <><Spinner size="extra-tiny" />&nbsp;Exporting…</> : "Export JSON"}
      </Button>
      <Button
        appearance="subtle"
        icon={<ArrowUploadRegular />}
        disabled={isLoading}
        onClick={onImport}
        title="Import policies from a JSON file"
      >
        Import JSON
      </Button>
      <Button
        appearance="subtle"
        icon={<TableRegular />}
        disabled={!canDiff || isLoading}
        onClick={onDiff}
        title="Compare assignments of exactly 2 selected policies"
      >
        Diff
      </Button>
      <Button
        appearance="subtle"
        icon={<ArrowClockwiseRegular />}
        disabled={isLoading}
        onClick={onRefresh}
        title="Refresh"
      />
    </div>
  );
}
