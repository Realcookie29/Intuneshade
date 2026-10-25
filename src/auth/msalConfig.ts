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

/**
 * Sign-in asks for read access only. Write scopes (WRITE_SCOPES) are requested
 * incrementally the first time a user performs a write action, so a token held
 * by someone who only reads reports cannot change the tenant.
 */
export const loginRequest: PopupRequest = {
  scopes: [
    "DeviceManagementApps.Read.All",
    "DeviceManagementConfiguration.Read.All",
    "DeviceManagementManagedDevices.Read.All",
    "DeviceManagementScripts.Read.All",              // Platform Scripts + Remediation Scripts
    "DeviceManagementServiceConfig.Read.All",        // Autopilot profiles
    "Group.Read.All",
    "Directory.Read.All",
  ],
};

/**
 * Write scopes, requested on the first write (assign, delete, enable/disable,
 * restore, filters, group membership, Autopilot group tags). IntuneShade never
 * writes to managed devices, so there is no ManagedDevices.ReadWrite scope.
 */
export const WRITE_SCOPES = [
  ...loginRequest.scopes,
  "DeviceManagementApps.ReadWrite.All",
  "DeviceManagementConfiguration.ReadWrite.All",
  "DeviceManagementScripts.ReadWrite.All",
  "DeviceManagementServiceConfig.ReadWrite.All",
  "GroupMember.ReadWrite.All",
];

/**
 * Extra read-only scopes for the CIS L1 benchmark. Requested on demand
 * (incremental consent) when a benchmark starts — not at sign-in — so users who
 * never run a benchmark are never asked for them.
 */
export const BASELINE_SCOPES = [
  ...loginRequest.scopes,
  "Policy.Read.All",                         // CA, authorization, auth methods, device registration, app management policies
  "RoleManagement.Read.Directory",           // role definitions, assignments, eligibility
  "RoleManagementPolicy.Read.Directory",     // PIM approval settings
  "AuditLog.Read.All",                       // userRegistrationDetails (MFA capable)
  "UserAuthenticationMethod.Read.All",       // userRegistrationDetails, per-user MFA state
  "AccessReview.Read.All",                   // access review definitions
  "OnPremDirectorySynchronization.Read.All", // password hash sync
];
