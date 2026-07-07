export interface GraphListResponse<T> {
  "@odata.context"?: string;
  "@odata.nextLink"?: string;
  value: T[];
}

export interface GraphGroup {
  id: string;
  displayName: string;
  securityEnabled: boolean;
}

export type AssignmentFilterManagementType = "devices" | "apps";

export interface AssignmentFilter {
  id: string;
  displayName: string;
  description?: string;
  platform?: string;
  rule?: string;
  assignmentFilterManagementType?: AssignmentFilterManagementType;
}

/** Payload for creating/updating an assignment filter. */
export interface AssignmentFilterInput {
  displayName: string;
  description: string;
  platform: string;
  rule: string;
  assignmentFilterManagementType: AssignmentFilterManagementType;
}

// ─── Audit events ───────────────────────────────────────────────────────────

export interface AuditActor {
  type?: string;
  auditActorType?: string;
  userPrincipalName?: string;
  applicationDisplayName?: string;
  servicePrincipalName?: string;
  ipAddress?: string;
  userId?: string;
}

export interface AuditModifiedProperty {
  displayName?: string;
  oldValue?: string | null;
  newValue?: string | null;
}

export interface AuditResource {
  displayName?: string;
  type?: string;
  auditResourceType?: string;
  resourceId?: string;
  modifiedProperties?: AuditModifiedProperty[];
}

export interface AuditEvent {
  id: string;
  displayName?: string;
  componentName?: string;
  activity?: string;
  activityDateTime: string;
  activityType?: string;
  activityOperationType?: string;
  activityResult?: string;
  category?: string;
  actor?: AuditActor;
  resources?: AuditResource[];
}

// ─── Group membership ───────────────────────────────────────────────────────

export interface DirectoryMember {
  id: string;
  "@odata.type"?: string;
  displayName?: string;
  userPrincipalName?: string;
  deviceId?: string;
  mail?: string;
  jobTitle?: string;
}

export interface GroupDetail extends GraphGroup {
  description?: string;
  groupTypes?: string[];
  membershipRule?: string | null;
  mailNickname?: string;
}

// ─── Managed devices ────────────────────────────────────────────────────────

export interface ManagedDevice {
  id: string;
  deviceName?: string;
  azureADDeviceId?: string;
  userPrincipalName?: string;
  operatingSystem?: string;
  osVersion?: string;
  model?: string;
  manufacturer?: string;
  complianceState?: string;
  managementAgent?: string;
  lastSyncDateTime?: string;
}
