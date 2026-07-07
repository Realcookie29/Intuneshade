export type AssignmentTargetODataType =
  | "#microsoft.graph.groupAssignmentTarget"
  | "#microsoft.graph.exclusionGroupAssignmentTarget"
  | "#microsoft.graph.allLicensedUsersAssignmentTarget"
  | "#microsoft.graph.allDevicesAssignmentTarget";

export type AppIntent = "required" | "available" | "uninstall" | "availableWithoutEnrollment";

export interface AssignmentTarget {
  "@odata.type": AssignmentTargetODataType;
  groupId?: string;
  deviceAndAppManagementAssignmentFilterId?: string | null;
  deviceAndAppManagementAssignmentFilterType?: "include" | "exclude" | null;
}

export interface GraphAssignment {
  id?: string;
  target: AssignmentTarget;
  intent?: AppIntent;
  settings?: Record<string, unknown> | null;
  "@odata.type"?: string;
}

export interface MobileAppAssignBody {
  mobileAppAssignments: GraphAssignment[];
}

export interface ScriptAssignBody {
  deviceManagementScriptAssignments: Array<{ target: AssignmentTarget }>;
}

export interface StandardAssignBody {
  assignments: GraphAssignment[];
}

export type AssignBody = MobileAppAssignBody | ScriptAssignBody | StandardAssignBody;

export interface AddAssignmentFormState {
  targetType: "group" | "allUsers" | "allDevices";
  assignmentDirection: "Include" | "Exclude";
  selectedGroupId: string | null;
  selectedGroupName: string | null;
  filterId: string | null;
  filterDisplayName: string | null;
  filterType: "include" | "exclude" | null;
  intent: AppIntent | null;
}
