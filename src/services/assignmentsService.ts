import { graphGetAll, graphPost, graphDelete } from "./graphClient";
import { getPolicyDefinition } from "../utils/policyConfig";
import { buildAssignTarget, buildAppAssignmentSettings } from "../utils/assignmentHelpers";
import type { PolicyType, GraphAssignmentRaw } from "../types/policyTypes";
import type { AddAssignmentFormState, GraphAssignment, AssignBody } from "../types/assignmentTypes";

export async function fetchCurrentAssignments(
  policyType: PolicyType,
  policyId: string
): Promise<GraphAssignmentRaw[]> {
  if (policyType === "configurationPolicies") {
    return graphGetAll<GraphAssignmentRaw>(
      `/deviceManagement/configurationPolicies('${policyId}')/assignments`
    );
  }

  if (policyType === "deviceManagementIntents") {
    return graphGetAll<GraphAssignmentRaw>(
      `/deviceManagement/intents/${policyId}/assignments`
    );
  }

  if (policyType === "windowsAutopilotDeploymentProfiles") {
    return graphGetAll<GraphAssignmentRaw>(
      `/deviceManagement/windowsAutopilotDeploymentProfiles/${policyId}/assignments`
    );
  }

  const def = getPolicyDefinition(policyType);
  return graphGetAll<GraphAssignmentRaw>(
    `/${def.namespace}/${policyType}('${policyId}')/assignments`
  );
}

function buildAssignBody(
  def: ReturnType<typeof getPolicyDefinition>,
  assignments: GraphAssignment[]
): AssignBody {
  if (def.assignBodyKey === "mobileAppAssignments") {
    return { mobileAppAssignments: assignments };
  }
  if (def.assignBodyKey === "deviceManagementScriptAssignments") {
    return {
      deviceManagementScriptAssignments: assignments.map((a) => ({ target: a.target })),
    };
  }
  return { assignments };
}

function getAssignUrl(policyType: PolicyType, policyId: string): string {
  if (policyType === "windowsAutopilotDeploymentProfiles") {
    return `/deviceManagement/windowsAutopilotDeploymentProfiles/${policyId}/assignments`;
  }
  const def = getPolicyDefinition(policyType);
  return `/${def.namespace}/${policyType}('${policyId}')/assign`;
}

function rawToAssignment(a: GraphAssignmentRaw): GraphAssignment {
  // Strip null filter fields — Graph rejects null for filterType (non-nullable enum)
  const { deviceAndAppManagementAssignmentFilterId, deviceAndAppManagementAssignmentFilterType, ...restTarget } =
    a.target as GraphAssignment["target"] & {
      deviceAndAppManagementAssignmentFilterId?: string | null;
      deviceAndAppManagementAssignmentFilterType?: string | null;
    };

  const cleanTarget = { ...restTarget } as GraphAssignment["target"] & Record<string, unknown>;
  if (deviceAndAppManagementAssignmentFilterId) {
    cleanTarget.deviceAndAppManagementAssignmentFilterId = deviceAndAppManagementAssignmentFilterId;
    cleanTarget.deviceAndAppManagementAssignmentFilterType =
      deviceAndAppManagementAssignmentFilterType ?? "include";
  }

  return {
    target: cleanTarget,
    ...(a.intent ? { intent: a.intent as GraphAssignment["intent"] } : {}),
    ...(a.settings !== undefined ? { settings: a.settings } : {}),
  };
}

export async function addAssignment(
  policyType: PolicyType,
  policyId: string,
  form: AddAssignmentFormState,
  appOdataType: string = ""
): Promise<void> {
  const def = getPolicyDefinition(policyType);
  const existing = await fetchCurrentAssignments(policyType, policyId);
  const newTarget = buildAssignTarget(form);
  const isExclusion = form.assignmentDirection === "Exclude";

  const newAssignment: GraphAssignment = {
    target: newTarget,
    ...(def.supportsIntent && form.intent ? { intent: form.intent } : {}),
    ...(def.supportsIntent && appOdataType
      ? {
          settings: buildAppAssignmentSettings(
            appOdataType,
            form.intent ?? "required",
            isExclusion
          ),
        }
      : {}),
  };

  if (def.autopilotDirectPost) {
    await graphPost(getAssignUrl(policyType, policyId), { target: newTarget });
    return;
  }

  const merged: GraphAssignment[] = [...existing.map(rawToAssignment), newAssignment];
  await graphPost(getAssignUrl(policyType, policyId), buildAssignBody(def, merged));
}

export async function deleteAssignment(
  policyType: PolicyType,
  policyId: string,
  groupId: string | null,
  assignmentId: string | undefined,
  targetOdataType: string
): Promise<void> {
  const def = getPolicyDefinition(policyType);

  if (def.autopilotDirectPost && assignmentId) {
    await graphDelete(
      `/deviceManagement/windowsAutopilotDeploymentProfiles/${policyId}/assignments/${assignmentId}`
    );
    return;
  }

  const existing = await fetchCurrentAssignments(policyType, policyId);

  const filtered: GraphAssignment[] = existing
    .filter((a) => {
      const sameType = a.target["@odata.type"] === targetOdataType;
      if (!groupId) return !sameType;
      return !(a.target.groupId === groupId && sameType);
    })
    .map(rawToAssignment);

  await graphPost(getAssignUrl(policyType, policyId), buildAssignBody(def, filtered));
}
