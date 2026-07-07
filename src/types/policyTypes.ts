export type PolicyType =
  | "mobileApps"
  | "configurationPolicies"
  | "deviceConfigurations"
  | "deviceCompliancePolicies"
  | "groupPolicyConfigurations"
  | "deviceManagementScripts"
  | "deviceHealthScripts"
  | "windowsAutopilotDeploymentProfiles"
  | "mobileAppConfigurations"
  | "deviceManagementIntents";

export type PolicyNamespace = "deviceAppManagement" | "deviceManagement";

export type AssignBodyKey =
  | "mobileAppAssignments"
  | "deviceManagementScriptAssignments"
  | "assignments";

export interface PolicyDefinition {
  type: PolicyType;
  label: string;
  namespace: PolicyNamespace;
  supportsFilters: boolean;
  supportsIntent: boolean;
  assignBodyKey: AssignBodyKey;
  autopilotDirectPost: boolean;
  fetchAssignmentsViaExpand: boolean;
}

export interface GraphPolicy {
  id: string;
  displayName?: string;
  name?: string;
  description?: string;
  "@odata.type"?: string;
  platforms?: string;
  isAssigned?: boolean;
  assignments?: GraphAssignmentRaw[];
}

export interface GraphAssignmentRaw {
  id?: string;
  target: {
    "@odata.type": string;
    groupId?: string;
    deviceAndAppManagementAssignmentFilterId?: string | null;
    deviceAndAppManagementAssignmentFilterType?: string | null;
  };
  intent?: string;
  settings?: Record<string, unknown> | null;
  "@odata.type"?: string;
}

export interface PolicyRow {
  policyId: string;
  policyName: string;
  policyDescription: string;
  policyOdataType: string;
  assignmentType: "Include" | "Exclude" | "All Users" | "All Devices" | "No Assignment";
  groupDisplayName: string;
  groupId: string | null;
  filterId: string | null;
  filterDisplayName: string;
  filterType: string | null;
  installIntent: string;
  assignmentId: string | undefined;
}
