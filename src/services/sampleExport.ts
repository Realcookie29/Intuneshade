/*
 * A fictional example export used by the offline JSON explorer's "Load sample"
 * button, so anyone can see the report without having their own file yet.
 * The shape mirrors what this app's Backup produces (and what a Graph export
 * with $expand=assignments looks like): a top-level `groups` name map plus
 * `policies` that each carry an `assignments` array. No real tenant data.
 */

const G = {
  all: "11111111-1111-1111-1111-111111111111",
  sales: "22222222-2222-2222-2222-222222222222",
  kiosks: "33333333-3333-3333-3333-333333333333",
  excl: "44444444-4444-4444-4444-444444444444",
  execs: "55555555-5555-5555-5555-555555555555",
};
const F_CORP = "aaaaaaaa-0000-0000-0000-000000000001";

function inc(groupId: string, filterId?: string, intent?: string) {
  return {
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId,
      ...(filterId ? { deviceAndAppManagementAssignmentFilterId: filterId, deviceAndAppManagementAssignmentFilterType: "include" } : {}),
    },
    ...(intent ? { intent } : {}),
  };
}
const exclude = (groupId: string) => ({ target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId } });
const allUsers = (intent?: string) => ({ target: { "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget" }, ...(intent ? { intent } : {}) });
const allDevices = () => ({ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } });

export const SAMPLE_EXPORT = {
  _exportedBy: "IntuneShade",
  _kind: "sample",
  groups: [
    { id: G.all, displayName: "Contoso-All-Devices" },
    { id: G.sales, displayName: "Sales-Pilot" },
    { id: G.kiosks, displayName: "Finance-Kiosks" },
    { id: G.excl, displayName: "Frontline-Excl" },
    { id: G.execs, displayName: "Executives" },
  ],
  filters: [{ id: F_CORP, displayName: "Corporate-Owned" }],
  policies: [
    {
      id: "p-1", displayName: "Windows 11 — Security Baseline", _policyType: "deviceCompliancePolicies",
      "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      assignments: [inc(G.all), exclude(G.excl)],
    },
    {
      id: "p-2", displayName: "Company Portal", _policyType: "mobileApps",
      "@odata.type": "#microsoft.graph.win32LobApp",
      assignments: [allUsers("required"), inc(G.sales, F_CORP, "available")],
    },
    {
      id: "p-3", name: "Edge — Hardening", _policyType: "configurationPolicies",
      "@odata.type": "#microsoft.graph.deviceManagementConfigurationPolicy",
      assignments: [inc(G.sales), inc(G.execs)],
    },
    {
      id: "p-4", displayName: "BitLocker Encryption", _policyType: "deviceConfigurations",
      "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration",
      assignments: [allDevices()],
    },
    {
      id: "p-5", displayName: "Detect Legacy TLS", _policyType: "deviceHealthScripts",
      assignments: [inc(G.all), exclude(G.kiosks)],
    },
    {
      id: "p-6", displayName: "Kiosk Compliance", _policyType: "deviceCompliancePolicies",
      "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      assignments: [inc(G.kiosks)],
    },
    {
      id: "p-7", displayName: "Corporate Autopilot", _policyType: "windowsAutopilotDeploymentProfiles",
      assignments: [allDevices()],
    },
    {
      id: "p-8", displayName: "Legacy VPN (unassigned)", _policyType: "deviceConfigurations",
      assignments: [],
    },
  ],
};

export const SAMPLE_EXPORT_JSON = JSON.stringify(SAMPLE_EXPORT);
