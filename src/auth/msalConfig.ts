import type { Configuration, PopupRequest } from "@azure/msal-browser";

// Azure App Registration (client) ID for IntuneShade.
// This is a public SPA client — no secret required. Safe to commit to source control.
// Self-hosters: replace this value with your own App Registration Client ID.
const CLIENT_ID = "023f2d55-3370-44a2-8569-9c2571a00489";

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: "https://login.microsoftonline.com/organizations",
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
};

export const loginRequest: PopupRequest = {
  scopes: [
    "DeviceManagementApps.ReadWrite.All",
    "DeviceManagementConfiguration.ReadWrite.All",
    "DeviceManagementManagedDevices.ReadWrite.All",
    "DeviceManagementScripts.ReadWrite.All",         // Platform Scripts + Remediation Scripts
    "DeviceManagementServiceConfig.ReadWrite.All",   // Autopilot profiles
    "Group.Read.All",
    "GroupMember.ReadWrite.All",                     // Group Membership management
    "Directory.Read.All",
  ],
};

/**
 * Extra read-only scopes for the IntuneShade Baseline benchmark. Requested on
 * demand (incremental consent) when a benchmark starts — not at sign-in — so
 * users who never run a benchmark are never asked for them.
 */
export const BASELINE_SCOPES = [
  ...loginRequest.scopes,
  "Policy.Read.All",                 // Conditional Access, security defaults, authorization + auth-methods policies
  "RoleManagement.Read.Directory",   // Privileged role members
];
