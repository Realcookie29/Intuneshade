import type { AddAssignmentFormState, AssignmentTarget, AssignmentTargetODataType, AppIntent, GraphAssignment } from "../types/assignmentTypes";
import type { PolicyRow, GraphPolicy } from "../types/policyTypes";

export function buildAssignTarget(form: AddAssignmentFormState): AssignmentTarget {
  let odataType: AssignmentTargetODataType;

  if (form.targetType === "allUsers") {
    odataType = "#microsoft.graph.allLicensedUsersAssignmentTarget";
  } else if (form.targetType === "allDevices") {
    odataType = "#microsoft.graph.allDevicesAssignmentTarget";
  } else if (form.assignmentDirection === "Exclude") {
    odataType = "#microsoft.graph.exclusionGroupAssignmentTarget";
  } else {
    odataType = "#microsoft.graph.groupAssignmentTarget";
  }

  const target: AssignmentTarget = { "@odata.type": odataType };

  if (form.targetType === "group" && form.selectedGroupId) {
    target.groupId = form.selectedGroupId;
  }

  // Only include filter fields when a filter is actually selected.
  // Graph rejects null for filterType (it's a non-nullable enum).
  if (form.filterId) {
    target.deviceAndAppManagementAssignmentFilterId = form.filterId;
    target.deviceAndAppManagementAssignmentFilterType = form.filterType ?? "include";
  }

  return target;
}

export function buildAppAssignmentSettings(
  appOdataType: string,
  intent: AppIntent,
  isExclusion: boolean
): Record<string, unknown> | null {
  if (isExclusion) return null;

  const type = appOdataType.replace("#microsoft.graph.", "");

  switch (type) {
    case "win32LobApp":
      return {
        "@odata.type": "#microsoft.graph.win32LobAppAssignmentSettings",
        notifications: "showAll",
        installTimeSettings: null,
        restartSettings: null,
        deliveryOptimizationPriority: "notConfigured",
      };
    case "winGetApp":
      return {
        "@odata.type": "#microsoft.graph.winGetAppAssignmentSettings",
        notifications: "showAll",
        installTimeSettings: null,
        restartSettings: null,
      };
    case "iosVppApp": {
      const uninstall = intent === "uninstall";
      return {
        "@odata.type": "#microsoft.graph.iosVppAppAssignmentSettings",
        useDeviceLicensing: true,
        uninstallOnDeviceRemoval: !uninstall,
        isRemovable: true,
        preventManagedAppBackup: false,
        preventAutoAppUpdate: false,
      };
    }
    case "iosStoreApp":
    case "iosLobApp":
      return {
        "@odata.type": `#microsoft.graph.${type}AssignmentSettings`,
        uninstallOnDeviceRemoval: intent !== "uninstall",
        isRemovable: true,
      };
    case "androidForWorkApp":
    case "androidManagedStoreApp":
      return {
        "@odata.type": "#microsoft.graph.androidManagedStoreAppAssignmentSettings",
        androidManagedStoreAppTrackIds: ["production"],
        autoUpdateMode: "priority",
      };
    case "macOSDmgApp":
    case "macOSPkgApp":
    case "androidLobApp":
    case "androidStoreApp":
      return null;
    default:
      return {
        "@odata.type": "#microsoft.graph.mobileAppAssignmentSettings",
        notifications: "showAll",
        installTimeSettings: null,
        restartSettings: null,
        deliveryOptimizationPriority: "notConfigured",
      };
  }
}

export function normalizeGroupDisplayName(
  target: { "@odata.type": string; groupId?: string },
  groupMap: Map<string, string>
): string {
  const t = target["@odata.type"];
  if (t === "#microsoft.graph.allLicensedUsersAssignmentTarget") return "All Users";
  if (t === "#microsoft.graph.allDevicesAssignmentTarget") return "All Devices";
  if (target.groupId) return groupMap.get(target.groupId) ?? target.groupId;
  return "Unknown";
}

export function getAssignmentTypeLabel(
  target: { "@odata.type": string }
): PolicyRow["assignmentType"] {
  const t = target["@odata.type"];
  if (t === "#microsoft.graph.allLicensedUsersAssignmentTarget") return "All Users";
  if (t === "#microsoft.graph.allDevicesAssignmentTarget") return "All Devices";
  if (t === "#microsoft.graph.exclusionGroupAssignmentTarget") return "Exclude";
  return "Include";
}

export function buildPolicyRows(
  policy: GraphPolicy,
  groupMap: Map<string, string>,
  filterMap: Map<string, string>
): PolicyRow[] {
  const assignments = policy.assignments ?? [];
  const policyName = policy.displayName ?? policy.name ?? "(No name)";

  if (assignments.length === 0) {
    return [
      {
        policyId: policy.id,
        policyName,
        policyDescription: policy.description ?? "",
        policyOdataType: policy["@odata.type"] ?? "",
        assignmentType: "No Assignment",
        groupDisplayName: "",
        groupId: null,
        filterId: null,
        filterDisplayName: "",
        filterType: null,
        installIntent: "",
        assignmentId: undefined,
      },
    ];
  }

  return assignments.map((a) => {
    const target = a.target as GraphAssignment["target"];
    return {
      policyId: policy.id,
      policyName,
      policyDescription: policy.description ?? "",
      policyOdataType: policy["@odata.type"] ?? "",
      assignmentType: getAssignmentTypeLabel(target),
      groupDisplayName: normalizeGroupDisplayName(target, groupMap),
      groupId: target.groupId ?? null,
      filterId: target.deviceAndAppManagementAssignmentFilterId ?? null,
      filterDisplayName: target.deviceAndAppManagementAssignmentFilterId
        ? (filterMap.get(target.deviceAndAppManagementAssignmentFilterId) ??
          target.deviceAndAppManagementAssignmentFilterId)
        : "",
      filterType: target.deviceAndAppManagementAssignmentFilterType ?? null,
      installIntent: a.intent ?? "",
      assignmentId: a.id,
    };
  });
}
