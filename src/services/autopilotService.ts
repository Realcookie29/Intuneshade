import { graphGet, graphGetAll, graphPost } from "./graphClient";

/** A Windows Autopilot device identity (subset of fields we use). */
export interface AutopilotDevice {
  id: string;
  serialNumber: string;
  groupTag: string;
  model: string;
  manufacturer: string;
  enrollmentState: string;
}

/**
 * Fetch every Windows Autopilot device identity in the tenant.
 *
 * Note: this endpoint is proxied to the DeviceEnrollment service and returns a
 * 500 when given `$select`, so we request full objects and pick fields client-side.
 */
export async function fetchAutopilotDevices(): Promise<AutopilotDevice[]> {
  const raw = await graphGetAll<Partial<AutopilotDevice>>(
    `/deviceManagement/windowsAutopilotDeviceIdentities`
  );
  return raw.map((d) => ({
    id: d.id ?? "",
    serialNumber: d.serialNumber ?? "",
    groupTag: d.groupTag ?? "",
    model: d.model ?? "",
    manufacturer: d.manufacturer ?? "",
    enrollmentState: d.enrollmentState ?? "",
  }));
}

/** Fetch a single Autopilot device (used to verify a tag change landed). */
export async function fetchAutopilotDevice(id: string): Promise<AutopilotDevice> {
  const d = await graphGet<Partial<AutopilotDevice>>(
    `/deviceManagement/windowsAutopilotDeviceIdentities/${id}`
  );
  return {
    id: d.id ?? id,
    serialNumber: d.serialNumber ?? "",
    groupTag: d.groupTag ?? "",
    model: d.model ?? "",
    manufacturer: d.manufacturer ?? "",
    enrollmentState: d.enrollmentState ?? "",
  };
}

/**
 * Set the Group Tag on one Autopilot device via the updateDeviceProperties
 * action. Sending only groupTag is the accepted pattern for retagging and does
 * not affect the assigned user or other properties.
 */
export async function setGroupTag(id: string, groupTag: string): Promise<void> {
  await graphPost(
    `/deviceManagement/windowsAutopilotDeviceIdentities/${id}/updateDeviceProperties`,
    { groupTag }
  );
}

export interface TagApplyResult {
  serialNumber: string;
  id: string;
  from: string;
  to: string;
  ok: boolean;
  error?: string;
}

export type TagProgress = (done: number, total: number) => void;

/**
 * Apply a group tag to many devices with limited concurrency. Devices that
 * already carry the target tag are skipped (reported as ok, no-op).
 */
export async function applyGroupTag(
  devices: AutopilotDevice[],
  tag: string,
  onProgress?: TagProgress
): Promise<TagApplyResult[]> {
  const results: TagApplyResult[] = new Array(devices.length);
  let index = 0;
  let done = 0;

  const worker = async () => {
    while (index < devices.length) {
      const i = index++;
      const d = devices[i];
      if (d.groupTag === tag) {
        results[i] = { serialNumber: d.serialNumber, id: d.id, from: d.groupTag, to: tag, ok: true };
      } else {
        try {
          await setGroupTag(d.id, tag);
          results[i] = { serialNumber: d.serialNumber, id: d.id, from: d.groupTag, to: tag, ok: true };
        } catch (e) {
          results[i] = {
            serialNumber: d.serialNumber, id: d.id, from: d.groupTag, to: tag, ok: false,
            error: e instanceof Error ? e.message : "Failed",
          };
        }
      }
      onProgress?.(++done, devices.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, devices.length) }, worker));
  return results;
}

// ─── CSV helpers ────────────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

/**
 * Extract serial numbers from either the Intune Autopilot import CSV
 * (`Device Serial Number, Windows Product ID, Hardware Hash, Group Tag, …`) or a
 * plain list with one serial per line. Deduplicates, preserving order.
 */
export function parseSerialsFromText(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  if (lines[0].charCodeAt(0) === 0xFEFF) lines[0] = lines[0].slice(1); // strip BOM

  let start = 0;
  let serialIdx = 0;
  const headerCells = splitCsvLine(lines[0]);
  if (headerCells.some((c) => /serial/i.test(c))) {
    const idx = headerCells.findIndex((c) => /serial/i.test(c));
    serialIdx = idx >= 0 ? idx : 0;
    start = 1;
  }

  const seen = new Set<string>();
  const serials: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = lines[i].includes(",") ? splitCsvLine(lines[i]) : [lines[i]];
    const s = (cells[serialIdx] ?? cells[0] ?? "").trim();
    const key = s.toLowerCase();
    if (s && !seen.has(key)) { seen.add(key); serials.push(s); }
  }
  return serials;
}

/** Build a CSV backup of current serial → group tag pairs (undo safety net). */
export function buildTagBackupCsv(devices: AutopilotDevice[]): string {
  const rows = devices.map((d) => `${d.serialNumber},${(d.groupTag ?? "").replace(/,/g, " ")}`);
  return ["Device Serial Number,Group Tag", ...rows].join("\r\n");
}
