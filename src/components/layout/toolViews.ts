import type { ToolView } from "./NavSidebar";

/** Every page — used to validate the page to reopen after a consent redirect. */
export const TOOL_VIEWS: readonly ToolView[] = [
  "home", "bulk", "conflict", "map", "report", "deviceCompliance", "assignmentReport", "requiredApps",
  "groupFinder", "settingsSearch", "filters", "backup", "audit", "groupMembership", "memberOfMigration",
  "agents", "autopilotTags", "compareDevice", "compareDeviceUser",
];
