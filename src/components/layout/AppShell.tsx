import { useState, useEffect } from "react";
import { makeStyles, tokens, Text } from "@fluentui/react-components";
import TopBar from "./TopBar";
import NavSidebar, { type ToolView } from "./NavSidebar";
import BulkAssignPage from "../bulk/BulkAssignPage";
import DeletePolicyDialog from "../bulk/DeletePolicyDialog";
import CloneDialog from "../bulk/CloneDialog";
import EnableDisableDialog from "../bulk/EnableDisableDialog";
import DiffDialog from "../bulk/DiffDialog";
import ImportDialog from "../bulk/ImportDialog";
import ConflictDashboard from "../conflicts/ConflictDashboard";
import AssignmentMatrixPage from "../map/AssignmentMatrixPage";
import ComplianceReportPage from "../report/ComplianceReportPage";
import AssignmentReportPage from "../report/AssignmentReportPage";
import GroupFinderPage from "../groups/GroupFinderPage";
import PolicySettingsSearchPage from "../search/PolicySettingsSearchPage";
import AssignmentFiltersPage from "../filters/AssignmentFiltersPage";
import AuditHistoryPage from "../audit/AuditHistoryPage";
import GroupMembershipPage from "../groups/GroupMembershipPage";
import AutopilotGroupTagPage from "../autopilot/AutopilotGroupTagPage";
import DeviceCompliancePage from "../compliance/DeviceCompliancePage";
import BackupRestorePage from "../backup/BackupRestorePage";
import DashboardPage from "../home/DashboardPage";
import ComparePage from "../compare/ComparePage";
import PolicyTable from "../policies/PolicyTable";
import PolicyTableToolbar from "../policies/PolicyTableToolbar";
import AddAssignmentDialog from "../assignments/AddAssignmentDialog";
import DeleteAssignmentDialog from "../assignments/DeleteAssignmentDialog";
import PolicyAnalysisPanel from "../analysis/PolicyAnalysisPanel";
import ErrorMessage from "../common/ErrorMessage";
import LoadingSpinner from "../common/LoadingSpinner";
import EmptyState from "../common/EmptyState";
import type { PolicyType, PolicyRow } from "../../types/policyTypes";
import type { AddAssignmentFormState } from "../../types/assignmentTypes";
import { usePolicies } from "../../hooks/usePolicies";
import { useGroups } from "../../hooks/useGroups";
import { useAssignments } from "../../hooks/useAssignments";
import { getPolicyDefinition } from "../../utils/policyConfig";
import { useAnalysisStore } from "../../store/analysisStore";
import { useApiKeyStore } from "../../store/apiKeyStore";
import { useDashboardStore } from "../../store/dashboardStore";
import { exportPoliciesToJson } from "../../services/bulkActionsService";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
    // When analysis panel is open, this shrinks — panel takes fixed width
    minWidth: 0,
  },
  header: {
    padding: "20px 24px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  pageTitle: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: "12px",
    display: "block",
  },
  content: {
    flex: 1,
    overflow: "auto",
  },
  placeholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: tokens.colorNeutralForeground3,
    gap: "12px",
  },
});

export default function AppShell() {
  const styles = useStyles();

  const [selectedType, setSelectedType] = useState<PolicyType | null>(null);
  const [activeTool, setActiveTool] = useState<ToolView | null>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRows, setSelectedRows] = useState<PolicyRow[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeletePolicyDialog, setShowDeletePolicyDialog] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showEnableDisableDialog, setShowEnableDisableDialog] = useState(false);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { rows, isLoading, error: fetchError, refresh } = usePolicies(selectedType);
  const { isLoading: groupsLoading } = useGroups();

  // Warm up the shared tenant scan once at login, as soon as the group cache is
  // ready. Every data page (Home, Assignment Report, Matrix, Compare) then reads
  // from this cache instantly; only a manual Refresh/Rescan re-hits Graph.
  useEffect(() => {
    if (!groupsLoading) useDashboardStore.getState().ensureLoaded();
  }, [groupsLoading]);
  const { add, remove, isSubmitting, error: mutationError, clearError } = useAssignments();
  const { analyze, panelOpen, scriptPanelOpen, openScriptPanel } = useAnalysisStore();
  const { apiKey, openDialog: openApiKeyDialog } = useApiKeyStore();

  const handleTypeSelect = (type: PolicyType) => {
    setActiveTool(null);
    setSelectedType(type);
    setSelectedRows([]);
    setSearchQuery("");
  };

  const handleToolSelect = (tool: ToolView) => {
    setActiveTool(tool);
    setSelectedType(null);
    setSelectedRows([]);
  };

  const filteredRows = searchQuery.trim()
    ? rows.filter(
        (r) =>
          r.policyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.groupDisplayName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : rows;

  const policyDef = selectedType ? getPolicyDefinition(selectedType) : null;

  const distinctPolicies = selectedRows.filter(
    (row, idx, arr) => arr.findIndex((r) => r.policyId === row.policyId) === idx
  );

  const handleAddConfirm = async (form: AddAssignmentFormState) => {
    for (const policy of distinctPolicies) {
      await add(selectedType!, policy.policyId, form, policy.policyOdataType);
    }
    setShowAddDialog(false);
    setSelectedRows([]);
    refresh();
  };

  const handleDeleteConfirm = async () => {
    const assignableRows = selectedRows.filter((r) => r.assignmentType !== "No Assignment");
    await remove(selectedType!, assignableRows);
    setShowDeleteDialog(false);
    setSelectedRows([]);
    refresh();
  };

  const handleAnalyze = () => {
    if (!apiKey) {
      openApiKeyDialog();
      return;
    }
    analyze(
      distinctPolicies.map((p) => ({
        id: p.policyId,
        name: p.policyName,
        type: selectedType ?? "mobileApps",
        // Only send fields relevant for analysis — avoid bloating the prompt
        json: {
          policyName: p.policyName,
          assignmentType: p.assignmentType,
          groupDisplayName: p.groupDisplayName,
          filterDisplayName: p.filterDisplayName,
          installIntent: p.installIntent,
          policyOdataType: p.policyOdataType,
        },
      }))
    );
  };

  const handleScriptGenerator = () => {
    if (!apiKey) {
      openApiKeyDialog();
      return;
    }
    openScriptPanel();
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportPoliciesToJson(
        selectedType!,
        distinctPolicies.map((p) => ({ id: p.policyId, name: p.policyName }))
      );
    } finally {
      setIsExporting(false);
    }
  };

  const canAdd = selectedRows.length > 0 && !isSubmitting;
  const canDelete =
    selectedRows.length > 0 &&
    selectedRows.some((r) => r.assignmentType !== "No Assignment") &&
    !isSubmitting;
  const canAnalyze = distinctPolicies.length > 0;
  const canDeletePolicy = distinctPolicies.length > 0;
  const canClone = distinctPolicies.length > 0;
  const canEnableDisable = distinctPolicies.length > 0 && selectedType === "configurationPolicies";
  const canExport = selectedRows.length > 0;
  const canDiff = distinctPolicies.length === 2;

  const showAnalysisPanel = panelOpen || scriptPanelOpen;

  return (
    <div className={styles.root}>
      <TopBar />
      <div className={styles.body}>
        <NavSidebar
          selectedType={selectedType}
          activeTool={activeTool}
          onSelectType={handleTypeSelect}
          onSelectTool={handleToolSelect}
        />

        <main className={styles.main}>
          {activeTool === "home" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <DashboardPage onNavigate={handleToolSelect} />
            </div>
          ) : activeTool === "compareDevice" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <ComparePage mode="device" />
            </div>
          ) : activeTool === "compareDeviceUser" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <ComparePage mode="deviceUser" />
            </div>
          ) : activeTool === "settingsSearch" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <PolicySettingsSearchPage />
            </div>
          ) : activeTool === "groupFinder" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <GroupFinderPage />
            </div>
          ) : activeTool === "groupMembership" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <GroupMembershipPage />
            </div>
          ) : activeTool === "autopilotTags" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <AutopilotGroupTagPage />
            </div>
          ) : activeTool === "filters" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <AssignmentFiltersPage />
            </div>
          ) : activeTool === "audit" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <AuditHistoryPage />
            </div>
          ) : activeTool === "backup" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <BackupRestorePage />
            </div>
          ) : activeTool === "report" ? (
            <div className={styles.content} style={{ padding: 0 }}>
              <ComplianceReportPage />
            </div>
          ) : activeTool === "assignmentReport" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <AssignmentReportPage />
            </div>
          ) : activeTool === "deviceCompliance" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <DeviceCompliancePage />
            </div>
          ) : activeTool === "map" ? (
            <div className={styles.content} style={{ padding: 0, overflow: "hidden" }}>
              <AssignmentMatrixPage />
            </div>
          ) : activeTool === "conflict" ? (
            <div className={styles.content}>
              <ConflictDashboard />
            </div>
          ) : activeTool === "bulk" ? (
            <>
              <div className={styles.header}>
                <Text className={styles.pageTitle}>Bulk Assign</Text>
              </div>
              <div className={styles.content} style={{ padding: 0 }}>
                <BulkAssignPage />
              </div>
            </>
          ) : selectedType ? (
            <>
              <div className={styles.header}>
                <Text className={styles.pageTitle}>{policyDef?.label}</Text>
                <PolicyTableToolbar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onAdd={() => setShowAddDialog(true)}
                  onDelete={() => setShowDeleteDialog(true)}
                  onRefresh={() => { setSelectedRows([]); refresh(); }}
                  onAnalyze={handleAnalyze}
                  onScriptGenerator={handleScriptGenerator}
                  onDeletePolicy={() => setShowDeletePolicyDialog(true)}
                  onClone={() => setShowCloneDialog(true)}
                  onEnableDisable={() => setShowEnableDisableDialog(true)}
                  onExport={handleExport}
                  onImport={() => setShowImportDialog(true)}
                  onDiff={() => setShowDiffDialog(true)}
                  canAdd={canAdd}
                  canDelete={canDelete}
                  canAnalyze={canAnalyze}
                  canDeletePolicy={canDeletePolicy}
                  canClone={canClone}
                  canEnableDisable={canEnableDisable}
                  canExport={canExport}
                  canDiff={canDiff}
                  isLoading={isLoading || groupsLoading}
                  isExporting={isExporting}
                />
              </div>
              <div className={styles.content}>
                {(fetchError ?? mutationError) && (
                  <div style={{ padding: "12px 24px" }}>
                    <ErrorMessage
                      message={(fetchError ?? mutationError)!}
                      onDismiss={fetchError ? undefined : clearError}
                    />
                  </div>
                )}
                {isLoading ? (
                  <LoadingSpinner label={`Loading ${policyDef?.label}...`} />
                ) : filteredRows.length === 0 ? (
                  <EmptyState
                    message={
                      searchQuery
                        ? "No results match your search."
                        : `No ${policyDef?.label.toLowerCase()} found.`
                    }
                  />
                ) : (
                  <PolicyTable
                    rows={filteredRows}
                    policyType={selectedType}
                    selectedRows={selectedRows}
                    onSelectionChange={setSelectedRows}
                  />
                )}
              </div>
            </>
          ) : (
            <div className={styles.placeholder}>
              <Text size={500} weight="semibold">Select a policy type</Text>
              <Text size={300}>
                Choose a category from the sidebar to view and manage group assignments.
              </Text>
            </div>
          )}
        </main>

        {/* AI Analysis panel — slides in from the right */}
        {showAnalysisPanel && <PolicyAnalysisPanel />}
      </div>

      {showAddDialog && selectedType && policyDef && (
        <AddAssignmentDialog
          policyType={selectedType}
          policyDef={policyDef}
          selectedPolicies={distinctPolicies}
          isSubmitting={isSubmitting}
          onConfirm={handleAddConfirm}
          onCancel={() => setShowAddDialog(false)}
        />
      )}

      {showDeleteDialog && selectedType && (
        <DeleteAssignmentDialog
          rows={selectedRows.filter((r) => r.assignmentType !== "No Assignment")}
          isSubmitting={isSubmitting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}

      {showDeletePolicyDialog && selectedType && (
        <DeletePolicyDialog
          policyType={selectedType}
          distinctPolicies={distinctPolicies}
          onDone={() => { setShowDeletePolicyDialog(false); setSelectedRows([]); refresh(); }}
          onCancel={() => setShowDeletePolicyDialog(false)}
        />
      )}

      {showCloneDialog && selectedType && (
        <CloneDialog
          policyType={selectedType}
          distinctPolicies={distinctPolicies}
          onDone={() => { setShowCloneDialog(false); setSelectedRows([]); refresh(); }}
          onCancel={() => setShowCloneDialog(false)}
        />
      )}

      {showEnableDisableDialog && (
        <EnableDisableDialog
          distinctPolicies={distinctPolicies}
          onDone={() => { setShowEnableDisableDialog(false); setSelectedRows([]); refresh(); }}
          onCancel={() => setShowEnableDisableDialog(false)}
        />
      )}

      {showDiffDialog && canDiff && (
        <DiffDialog
          policyA={selectedRows.filter((r) => r.policyId === distinctPolicies[0].policyId)}
          policyB={selectedRows.filter((r) => r.policyId === distinctPolicies[1].policyId)}
          onClose={() => setShowDiffDialog(false)}
        />
      )}

      {showImportDialog && (
        <ImportDialog
          onDone={() => { setShowImportDialog(false); refresh(); }}
          onCancel={() => setShowImportDialog(false)}
        />
      )}
    </div>
  );
}
