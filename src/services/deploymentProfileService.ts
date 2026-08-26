import { graphGet, graphGetAll } from "./graphClient";
import type { GraphListResponse } from "../types/graphTypes";

/**
 * Resolving "which apps land on the devices of an Autopilot deployment profile"
 * needs the profile's devices and, per device, its Entra group membership.
 * Both are expensive, so results are cached per profile for the session.
 */

/** One Windows Autopilot device identity belonging to a deployment profile. */
export interface ProfileDevice {
  id: string;
  serialNumber: string;
  displayName: string;
  aadDeviceId: string;
  assignmentStatus: string;
}

export interface ResolvedProfileDevices {
  devices: ProfileDevice[];
  /** Union of every Entra group the profile's devices belong to (transitive). */
  groupIds: Set<string>;
  /** How many of the profile's devices sit in each group — drives the Devices column. */
  deviceCountByGroupId: Map<string, number>;
  /** Devices whose Entra object or membership could not be read. */
  unresolved: number;
  warnings: string[];
}

export type ProfileScanProgress = (done: number, total: number) => void;

/**
 * Devices assigned to one deployment profile.
 *
 * Like `windowsAutopilotDeviceIdentities`, this endpoint is proxied to the
 * DeviceEnrollment service and rejects `$select`, so full objects are fetched
 * and the fields are picked client-side.
 */
export async function fetchProfileDevices(profileId: string): Promise<ProfileDevice[]> {
  const raw = await graphGetAll<Record<string, unknown>>(
    `/deviceManagement/windowsAutopilotDeploymentProfiles/${profileId}/assignedDevices`
  );
  return raw.map((d) => ({
    id: String(d.id ?? ""),
    serialNumber: String(d.serialNumber ?? ""),
    displayName: String(d.displayName ?? d.azureActiveDirectoryDeviceId ?? ""),
    aadDeviceId: String(d.azureActiveDirectoryDeviceId ?? ""),
    assignmentStatus: String(d.deploymentProfileAssignmentStatus ?? ""),
  }));
}

const esc = (s: string) => s.trim().replace(/'/g, "''");

/** Transitive Entra group IDs for one device, looked up by its Entra device ID. */
async function groupIdsForAadDevice(aadDeviceId: string): Promise<string[] | null> {
  const entra = await graphGet<GraphListResponse<{ id: string }>>(
    `/devices?$filter=deviceId eq '${esc(aadDeviceId)}'&$select=id`
  );
  const objectId = entra.value?.[0]?.id;
  if (!objectId) return null;

  const groups = await graphGetAll<{ id: string }>(
    `/devices/${objectId}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`
  );
  return groups.map((g) => g.id);
}

/** Runs `worker` over `items` with a bounded number of concurrent requests. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  onProgress?: ProfileScanProgress,
): Promise<void> {
  let index = 0;
  let done = 0;
  const run = async () => {
    while (index < items.length) {
      const item = items[index++];
      try {
        await worker(item);
      } catch {
        /* per-item failures are counted by the caller */
      }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

const profileCache = new Map<string, ResolvedProfileDevices>();

export function isProfileScanned(profileId: string): boolean {
  return profileCache.has(profileId);
}

export function clearProfileScan(profileId?: string): void {
  if (profileId) profileCache.delete(profileId);
  else profileCache.clear();
}

/**
 * Fetch a profile's devices and resolve each device's transitive group
 * membership, so app assignments can be matched against the real devices
 * rather than against the profile's own target groups.
 *
 * Costs two Graph calls per device, so results are cached until `force`.
 */
export async function scanProfileDevices(
  profileId: string,
  onProgress?: ProfileScanProgress,
  force = false,
): Promise<ResolvedProfileDevices> {
  const cached = profileCache.get(profileId);
  if (cached && !force) return cached;

  const warnings: string[] = [];
  let devices: ProfileDevice[] = [];
  try {
    devices = await fetchProfileDevices(profileId);
  } catch (e) {
    throw new Error(
      `Couldn't read the devices of this deployment profile. ${e instanceof Error ? e.message : ""}`.trim()
    );
  }

  const groupIds = new Set<string>();
  const deviceCountByGroupId = new Map<string, number>();
  let unresolved = 0;

  const withAadId = devices.filter((d) => d.aadDeviceId);
  if (withAadId.length < devices.length) {
    unresolved += devices.length - withAadId.length;
    warnings.push(
      `${devices.length - withAadId.length} device(s) are not registered in Entra ID yet, so their group membership is unknown.`
    );
  }

  await mapWithConcurrency(
    withAadId,
    6,
    async (d) => {
      const ids = await groupIdsForAadDevice(d.aadDeviceId);
      if (ids === null) {
        unresolved++;
        return;
      }
      for (const id of ids) {
        groupIds.add(id);
        deviceCountByGroupId.set(id, (deviceCountByGroupId.get(id) ?? 0) + 1);
      }
    },
    onProgress,
  );

  if (unresolved > 0 && warnings.length === 0) {
    warnings.push(`${unresolved} device(s) could not be resolved to an Entra device object.`);
  }

  const result: ResolvedProfileDevices = {
    devices,
    groupIds,
    deviceCountByGroupId,
    unresolved,
    warnings,
  };
  profileCache.set(profileId, result);
  return result;
}
