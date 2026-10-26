// ─── Windows 11 device settings — CIS ID → Intune settings catalog ───────────
// Hand-mapped subset of the CIS Microsoft Windows 11 Enterprise Benchmark (L1 +
// BitLocker) that Intune configures through the settings catalog / endpoint
// security (which are settings-catalog based). Titles are IntuneShade's own
// wording — never copy CIS text. Every definition id and expected option is
// verified at run time against the tenant's own settings catalog
// (/deviceManagement/configurationSettings); an id or option that the catalog
// does not know turns the check into Manual ("mapping needs review") instead
// of a false Fail.

import type { Severity } from "../types";

/** Rule a configured value must satisfy. Choice values are matched on the option suffix after the definition id. */
export type SettingRule =
  | { t: "choice"; ok: string[]; partial?: string[] }
  | { t: "int"; min?: number; max?: number; notZero?: boolean }
  | { t: "text"; equals?: string }
  | { t: "sids"; sids: string[] }
  /** Every child setting must pass (e.g. the ASR rules); some passing gives Partial. */
  | { t: "all"; children: Array<{ def: string; label: string; rule: SettingRule }> };

export interface WindowsMapping {
  /** CIS Windows 11 benchmark id (without the W- prefix used as check id). */
  cis: string;
  area: WindowsArea;
  title: string;
  /** Settings catalog definition id — or alternatives, of which the first configured one counts. */
  def: string | string[];
  rule: SettingRule;
  severity?: Severity;
  note?: string;
}

export type WindowsArea =
  | "Windows: BitLocker"
  | "Windows: Defender"
  | "Windows: Firewall"
  | "Windows: LAPS"
  | "Windows: Audit"
  | "Windows: Hardening";

export const WINDOWS_AREAS: WindowsArea[] = [
  "Windows: BitLocker", "Windows: Defender", "Windows: Firewall", "Windows: LAPS", "Windows: Audit", "Windows: Hardening",
];

export const AREA_SEVERITY: Record<WindowsArea, Severity> = {
  "Windows: BitLocker": "High",
  "Windows: Defender": "High",
  "Windows: Firewall": "High",
  "Windows: LAPS": "High",
  "Windows: Audit": "Medium",
  "Windows: Hardening": "Medium",
};

const on = (...ok: string[]): SettingRule => ({ t: "choice", ok: ok.length ? ok : ["_1"] });
const off: SettingRule = { t: "choice", ok: ["_0"] };
const yes: SettingRule = { t: "choice", ok: ["_true"] };

// Audit CSP: 0 = none, 1 = success, 2 = failure, 3 = success and failure.
const AUDIT_BOTH: SettingRule = { t: "choice", ok: ["_3"], partial: ["_1", "_2"] };
const AUDIT_SUCCESS: SettingRule = { t: "choice", ok: ["_1", "_3"] };
const AUDIT_FAILURE: SettingRule = { t: "choice", ok: ["_2", "_3"] };

const BL = "device_vendor_msft_bitlocker_";
const OSR = `${BL}systemdrivesrecoveryoptions`;
const FDR = `${BL}fixeddrivesrecoveryoptions`;
const AUDIT = "device_vendor_msft_policy_config_audit_";
const DEF = "device_vendor_msft_policy_config_defender_";
const FW = "vendor_msft_firewall_mdmstore_";
const LAPS = "device_vendor_msft_laps_policies_";
const SEC = "device_vendor_msft_policy_config_localpoliciessecurityoptions_";
const POL = "device_vendor_msft_policy_config_";
const ASR = `${DEF}attacksurfacereductionrules`;

/** ASR rules the benchmark expects in block mode (warn also counts; audit only gives Partial). */
const ASR_RULES: Array<[string, string]> = [
  ["blockexecutablecontentfromemailclientandwebmail", "Executable content from email and webmail"],
  ["blockallofficeapplicationsfromcreatingchildprocesses", "Office apps creating child processes"],
  ["blockofficeapplicationsfromcreatingexecutablecontent", "Office apps creating executable content"],
  ["blockofficeapplicationsfrominjectingcodeintootherprocesses", "Office apps injecting into other processes"],
  ["blockjavascriptorvbscriptfromlaunchingdownloadedexecutablecontent", "JavaScript/VBScript launching downloads"],
  ["blockexecutionofpotentiallyobfuscatedscripts", "Potentially obfuscated scripts"],
  ["blockwin32apicallsfromofficemacros", "Win32 API calls from Office macros"],
  ["blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem", "Credential stealing from LSASS"],
  ["blockuntrustedunsignedprocessesthatrunfromusb", "Untrusted processes from USB"],
  ["blockpersistencethroughwmieventsubscription", "Persistence through WMI event subscription"],
  ["blockabuseofexploitedvulnerablesigneddrivers", "Abuse of vulnerable signed drivers"],
  ["blockadobereaderfromcreatingchildprocesses", "Adobe Reader creating child processes"],
  ["blockofficecommunicationappfromcreatingchildprocesses", "Office communication apps creating child processes"],
];

const fw = (profile: "domain" | "private" | "public", key: string) => `${FW}${profile}profile_${key}`;

export const WINDOWS_MAPPINGS: WindowsMapping[] = [
  // ── BitLocker: operating system drive ─────────────────────────────────────
  { cis: "18.10.9.2.1", area: "Windows: BitLocker", title: "Enhanced startup PINs are allowed", def: `${BL}systemdrivesenhancedpin`, rule: on() },
  { cis: "18.10.9.2.3", area: "Windows: BitLocker", title: "OS drive recovery options are configured", def: OSR, rule: on() },
  { cis: "18.10.9.2.4", area: "Windows: BitLocker", title: "OS drive: certificate-based data recovery agent not allowed", def: `${OSR}_osallowdra_name`, rule: off },
  { cis: "18.10.9.2.5", area: "Windows: BitLocker", title: "OS drive requires a 48-digit recovery password", def: `${OSR}_osrecoverypasswordusagedropdown_name`, rule: on("_1") },
  { cis: "18.10.9.2.6", area: "Windows: BitLocker", title: "OS drive: 256-bit recovery key not allowed", def: `${OSR}_osrecoverykeyusagedropdown_name`, rule: off },
  { cis: "18.10.9.2.7", area: "Windows: BitLocker", title: "OS drive: recovery options hidden from the setup wizard", def: `${OSR}_oshiderecoverypage_name`, rule: on() },
  { cis: "18.10.9.2.8", area: "Windows: BitLocker", title: "OS drive recovery information is backed up to the directory", def: `${OSR}_osactivedirectorybackup_name`, rule: on() },
  { cis: "18.10.9.2.9", area: "Windows: BitLocker", title: "OS drive backup includes recovery passwords and key packages", def: `${OSR}_osactivedirectorybackupdropdown_name`, rule: on("_1") },
  { cis: "18.10.9.2.10", area: "Windows: BitLocker", title: "OS drive encryption waits until recovery info is backed up", def: `${OSR}_osrequireactivedirectorybackup_name`, rule: on() },
  { cis: "18.10.9.2.13", area: "Windows: BitLocker", title: "Additional startup authentication is configured", def: `${BL}systemdrivesrequirestartupauthentication`, rule: on() },
  { cis: "18.10.9.2.14", area: "Windows: BitLocker", title: "BitLocker without a compatible TPM is not allowed", def: `${BL}systemdrivesrequirestartupauthentication_configurenontpmstartupkeyusage_name`, rule: off },
  // ── BitLocker: fixed data drives ──────────────────────────────────────────
  { cis: "18.10.9.1.2", area: "Windows: BitLocker", title: "Fixed drive recovery options are configured", def: FDR, rule: on() },
  { cis: "18.10.9.1.3", area: "Windows: BitLocker", title: "Fixed drives: certificate-based data recovery agent allowed", def: `${FDR}_fdvallowdra_name`, rule: on() },
  { cis: "18.10.9.1.4", area: "Windows: BitLocker", title: "Fixed drives: 48-digit recovery password allowed or required", def: `${FDR}_fdvrecoverypasswordusagedropdown_name`, rule: on("_1", "_2") },
  { cis: "18.10.9.1.5", area: "Windows: BitLocker", title: "Fixed drives: 256-bit recovery key allowed or required", def: `${FDR}_fdvrecoverykeyusagedropdown_name`, rule: on("_1", "_2") },
  { cis: "18.10.9.1.6", area: "Windows: BitLocker", title: "Fixed drives: recovery options hidden from the setup wizard", def: `${FDR}_fdvhiderecoverypage_name`, rule: on() },
  { cis: "18.10.9.1.7", area: "Windows: BitLocker", title: "Fixed drives: recovery info not saved to on-prem AD DS", def: `${FDR}_fdvactivedirectorybackup_name`, rule: off },
  { cis: "18.10.9.1.8", area: "Windows: BitLocker", title: "Fixed drives: backup scope is passwords and key packages", def: `${FDR}_fdvactivedirectorybackupdropdown_name`, rule: on("_1") },
  { cis: "18.10.9.1.9", area: "Windows: BitLocker", title: "Fixed drives: encryption does not wait for AD DS backup", def: `${FDR}_fdvrequireactivedirectorybackup_name`, rule: off },
  // ── BitLocker: removable drives, DMA, standby ─────────────────────────────
  { cis: "18.10.9.3.14", area: "Windows: BitLocker", title: "Write access blocked to removable drives without BitLocker", def: `${BL}removabledrivesrequireencryption`, rule: on() },
  { cis: "18.10.9.3.15", area: "Windows: BitLocker", title: "Removable drives configured in another organisation are not trusted for write", def: `${BL}removabledrivesrequireencryption_rdvcrossorg`, rule: off },
  { cis: "18.10.9.4", area: "Windows: BitLocker", title: "New DMA devices are blocked while the device is locked", def: `${POL}dataprotection_allowdirectmemoryaccess`, rule: off },
  { cis: "18.9.24.1", area: "Windows: BitLocker", title: "Kernel DMA protection blocks incompatible external devices", def: `${POL}dmaguard_deviceenumerationpolicy`, rule: off },
  { cis: "18.9.33.6.3", area: "Windows: BitLocker", title: "No standby (S1–S3) when sleeping on battery", def: `${POL}power_allowstandbystateswhensleepingonbattery`, rule: off },
  { cis: "18.9.33.6.4", area: "Windows: BitLocker", title: "No standby (S1–S3) when sleeping plugged in", def: `${POL}power_allowstandbywhensleepingpluggedin`, rule: off },

  // ── Defender Antivirus / ASR ──────────────────────────────────────────────
  { cis: "18.10.42.10.1", area: "Windows: Defender", title: "Downloaded files and attachments are scanned", def: `${DEF}allowioavprotection`, rule: on() },
  { cis: "18.10.42.10.2", area: "Windows: Defender", title: "Real-time protection is on", def: `${DEF}allowrealtimemonitoring`, rule: on() },
  { cis: "18.10.42.10.3", area: "Windows: Defender", title: "Behaviour monitoring is on", def: `${DEF}allowbehaviormonitoring`, rule: on() },
  { cis: "18.10.42.10.4", area: "Windows: Defender", title: "Script scanning is on", def: `${DEF}allowscriptscanning`, rule: on() },
  { cis: "18.10.42.13.2", area: "Windows: Defender", title: "Removable drives are scanned", def: `${DEF}allowfullscanremovabledrivescanning`, rule: on() },
  { cis: "18.10.42.13.3", area: "Windows: Defender", title: "Email scanning is on", def: `${DEF}allowemailscanning`, rule: on() },
  { cis: "18.10.42.16", area: "Windows: Defender", title: "Potentially unwanted apps are blocked", def: `${DEF}puaprotection`, rule: { t: "choice", ok: ["_1"], partial: ["_2"] } },
  { cis: "18.10.42.6.3.1", area: "Windows: Defender", title: "Network protection blocks dangerous sites", def: `${DEF}enablenetworkprotection`, rule: { t: "choice", ok: ["_1"], partial: ["_2"] } },
  {
    cis: "18.10.42.6.1.2", area: "Windows: Defender", title: "Attack surface reduction rules are in block mode", def: ASR,
    rule: { t: "all", children: ASR_RULES.map(([slug, label]) => ({ def: `${ASR}_${slug}`, label, rule: { t: "choice" as const, ok: ["_block", "_warn"], partial: ["_audit"] } })) },
  },

  // ── Firewall ──────────────────────────────────────────────────────────────
  { cis: "9.1.1", area: "Windows: Firewall", title: "Domain profile: firewall on", def: fw("domain", "enablefirewall"), rule: yes },
  { cis: "9.1.3", area: "Windows: Firewall", title: "Domain profile: inbound block notifications off", def: fw("domain", "disableinboundnotifications"), rule: yes },
  { cis: "9.1.4", area: "Windows: Firewall", title: "Domain profile: log file in the standard location", def: fw("domain", "logfilepath"), rule: { t: "text", equals: "%SystemRoot%\\System32\\logfiles\\firewall\\domainfw.log" } },
  { cis: "9.1.5", area: "Windows: Firewall", title: "Domain profile: log size at least 16 MB", def: fw("domain", "logmaxfilesize"), rule: { t: "int", min: 16384 } },
  { cis: "9.1.6", area: "Windows: Firewall", title: "Domain profile: dropped packets are logged", def: fw("domain", "enablelogdroppedpackets"), rule: yes },
  { cis: "9.1.7", area: "Windows: Firewall", title: "Domain profile: successful connections are logged", def: fw("domain", "enablelogsuccessconnections"), rule: yes },
  { cis: "9.2.1", area: "Windows: Firewall", title: "Private profile: firewall on", def: fw("private", "enablefirewall"), rule: yes },
  { cis: "9.2.3", area: "Windows: Firewall", title: "Private profile: inbound block notifications off", def: fw("private", "disableinboundnotifications"), rule: yes },
  { cis: "9.3.1", area: "Windows: Firewall", title: "Public profile: firewall on", def: fw("public", "enablefirewall"), rule: yes },
  { cis: "9.3.3", area: "Windows: Firewall", title: "Public profile: inbound block notifications off", def: fw("public", "disableinboundnotifications"), rule: yes },

  // ── Windows LAPS ──────────────────────────────────────────────────────────
  { cis: "18.9.25.1", area: "Windows: LAPS", title: "Local admin password is backed up (Entra ID or AD)", def: `${LAPS}backupdirectory`, rule: on("_1", "_2") },
  { cis: "18.9.25.4", area: "Windows: LAPS", title: "LAPS password uses all character classes", def: `${LAPS}passwordcomplexity`, rule: on("_4") },
  { cis: "18.9.25.5", area: "Windows: LAPS", title: "LAPS password is at least 15 characters", def: `${LAPS}passwordlength`, rule: { t: "int", min: 15 } },
  { cis: "18.9.25.6", area: "Windows: LAPS", title: "LAPS password rotates at least every 30 days", def: [`${LAPS}passwordagedays_aad`, `${LAPS}passwordagedays`], rule: { t: "int", max: 30, notZero: true } },
  { cis: "18.9.25.7", area: "Windows: LAPS", title: "LAPS resets within 8 hours after use", def: `${LAPS}postauthenticationresetdelay`, rule: { t: "int", min: 1, max: 8 } },
  { cis: "18.9.25.8", area: "Windows: LAPS", title: "LAPS resets the password and signs the account out after use", def: `${LAPS}postauthenticationactions`, rule: on("_3", "_5", "_11") },

  // ── Advanced audit policy (Audit CSP) ─────────────────────────────────────
  { cis: "17.1.1", area: "Windows: Audit", title: "Audit credential validation (success + failure)", def: `${AUDIT}accountlogon_auditcredentialvalidation`, rule: AUDIT_BOTH },
  { cis: "17.2.1", area: "Windows: Audit", title: "Audit application group management (success + failure)", def: `${AUDIT}accountmanagement_auditapplicationgroupmanagement`, rule: AUDIT_BOTH },
  { cis: "17.2.2", area: "Windows: Audit", title: "Audit security group management (success)", def: `${AUDIT}accountmanagement_auditsecuritygroupmanagement`, rule: AUDIT_SUCCESS },
  { cis: "17.2.3", area: "Windows: Audit", title: "Audit user account management (success + failure)", def: `${AUDIT}accountmanagement_audituseraccountmanagement`, rule: AUDIT_BOTH },
  { cis: "17.3.1", area: "Windows: Audit", title: "Audit PnP activity (success)", def: `${AUDIT}detailedtracking_auditpnpactivity`, rule: AUDIT_SUCCESS },
  { cis: "17.3.2", area: "Windows: Audit", title: "Audit process creation (success)", def: `${AUDIT}detailedtracking_auditprocesscreation`, rule: AUDIT_SUCCESS },
  { cis: "17.5.1", area: "Windows: Audit", title: "Audit account lockout (failure)", def: `${AUDIT}accountlogonlogoff_auditaccountlockout`, rule: AUDIT_FAILURE },
  { cis: "17.5.2", area: "Windows: Audit", title: "Audit group membership (success)", def: `${AUDIT}accountlogonlogoff_auditgroupmembership`, rule: AUDIT_SUCCESS },
  { cis: "17.5.3", area: "Windows: Audit", title: "Audit logoff (success)", def: `${AUDIT}accountlogonlogoff_auditlogoff`, rule: AUDIT_SUCCESS },
  { cis: "17.5.4", area: "Windows: Audit", title: "Audit logon (success + failure)", def: `${AUDIT}accountlogonlogoff_auditlogon`, rule: AUDIT_BOTH },
  { cis: "17.5.5", area: "Windows: Audit", title: "Audit other logon/logoff events (success + failure)", def: `${AUDIT}accountlogonlogoff_auditotherlogonlogoffevents`, rule: AUDIT_BOTH },
  { cis: "17.5.6", area: "Windows: Audit", title: "Audit special logon (success)", def: `${AUDIT}accountlogonlogoff_auditspeciallogon`, rule: AUDIT_SUCCESS },
  { cis: "17.6.1", area: "Windows: Audit", title: "Audit detailed file share (failure)", def: `${AUDIT}objectaccess_auditdetailedfileshare`, rule: AUDIT_FAILURE },
  { cis: "17.6.2", area: "Windows: Audit", title: "Audit file share (success + failure)", def: `${AUDIT}objectaccess_auditfileshare`, rule: AUDIT_BOTH },
  { cis: "17.6.3", area: "Windows: Audit", title: "Audit other object access events (success + failure)", def: `${AUDIT}objectaccess_auditotherobjectaccessevents`, rule: AUDIT_BOTH },
  { cis: "17.6.4", area: "Windows: Audit", title: "Audit removable storage (success + failure)", def: `${AUDIT}objectaccess_auditremovablestorage`, rule: AUDIT_BOTH },
  { cis: "17.7.1", area: "Windows: Audit", title: "Audit audit-policy changes (success)", def: `${AUDIT}policychange_auditpolicychange`, rule: AUDIT_SUCCESS },
  { cis: "17.7.2", area: "Windows: Audit", title: "Audit authentication policy changes (success)", def: `${AUDIT}policychange_auditauthenticationpolicychange`, rule: AUDIT_SUCCESS },
  { cis: "17.7.3", area: "Windows: Audit", title: "Audit authorization policy changes (success)", def: `${AUDIT}policychange_auditauthorizationpolicychange`, rule: AUDIT_SUCCESS },
  { cis: "17.7.4", area: "Windows: Audit", title: "Audit firewall rule-level policy changes (success + failure)", def: `${AUDIT}policychange_auditmpssvcrulelevelpolicychange`, rule: AUDIT_BOTH },
  { cis: "17.7.5", area: "Windows: Audit", title: "Audit other policy change events (failure)", def: `${AUDIT}policychange_auditotherpolicychangeevents`, rule: AUDIT_FAILURE },
  { cis: "17.8.1", area: "Windows: Audit", title: "Audit sensitive privilege use (success + failure)", def: `${AUDIT}privilegeuse_auditsensitiveprivilegeuse`, rule: AUDIT_BOTH },
  { cis: "17.9.1", area: "Windows: Audit", title: "Audit IPsec driver (success + failure)", def: `${AUDIT}system_auditipsecdriver`, rule: AUDIT_BOTH },
  { cis: "17.9.2", area: "Windows: Audit", title: "Audit other system events (success + failure)", def: `${AUDIT}system_auditothersystemevents`, rule: AUDIT_BOTH },
  { cis: "17.9.3", area: "Windows: Audit", title: "Audit security state change (success)", def: `${AUDIT}system_auditsecuritystatechange`, rule: AUDIT_SUCCESS },
  { cis: "17.9.4", area: "Windows: Audit", title: "Audit security system extension (success)", def: `${AUDIT}system_auditsecuritysystemextension`, rule: AUDIT_SUCCESS },
  { cis: "17.9.5", area: "Windows: Audit", title: "Audit system integrity (success + failure)", def: `${AUDIT}system_auditsystemintegrity`, rule: AUDIT_BOTH },

  // ── Hardening (security options, user rights, system policies) ────────────
  { cis: "2.2.23", area: "Windows: Hardening", title: "Only service accounts may generate security audits", def: `${POL}userrights_generatesecurityaudits`, rule: { t: "sids", sids: ["S-1-5-19", "S-1-5-20"] } },
  { cis: "2.2.24", area: "Windows: Hardening", title: "Client impersonation limited to admins and service accounts", def: `${POL}userrights_impersonateclient`, rule: { t: "sids", sids: ["S-1-5-32-544", "S-1-5-19", "S-1-5-20", "S-1-5-6"] } },
  { cis: "2.3.1.1", area: "Windows: Hardening", title: "Microsoft accounts cannot be added or used to sign in", def: `${SEC}accounts_blockmicrosoftaccounts`, rule: on("_3") },
  { cis: "2.3.7.3", area: "Windows: Hardening", title: "Machine lockout after at most 10 failed sign-ins", def: `${SEC}interactivelogon_machineaccountlockoutthreshold`, rule: { t: "int", min: 1, max: 10 } },
  { cis: "2.3.7.5", area: "Windows: Hardening", title: "A sign-in legal notice text is set", def: `${SEC}interactivelogon_messagetextforusersattemptingtologon`, rule: { t: "text" }, severity: "Low" },
  { cis: "2.3.7.6", area: "Windows: Hardening", title: "A sign-in legal notice title is set", def: `${SEC}interactivelogon_messagetitleforusersattemptingtologon`, rule: { t: "text" }, severity: "Low" },
  { cis: "2.3.17.4", area: "Windows: Hardening", title: "UAC detects application installs and prompts", def: `${SEC}useraccountcontrol_detectapplicationinstallationsandpromptforelevation`, rule: on() },
  { cis: "2.3.17.7", area: "Windows: Hardening", title: "UAC prompts on the secure desktop", def: `${SEC}useraccountcontrol_switchtothesecuredesktopwhenpromptingforelevation`, rule: on() },
  { cis: "18.9.26.2", area: "Windows: Hardening", title: "LSASS runs as a protected process with UEFI lock", def: `${POL}lsa_configurelsaprotectedprocess`, rule: on("_1"), severity: "High" },
  { cis: "18.7.8", area: "Windows: Hardening", title: "Only administrators can install print drivers", def: `${POL}printers_restrictdriverinstallationtoadministrators`, rule: on() },
  { cis: "18.10.3.2", area: "Windows: Hardening", title: "Non-admins cannot install packaged apps", def: `${POL}applicationmanagement_blocknonadminuserinstall`, rule: on() },
  { cis: "18.10.17.1", area: "Windows: Hardening", title: "App Installer is turned off", def: `${POL}desktopappinstaller_enableappinstaller`, rule: off },
  { cis: "18.10.65.2", area: "Windows: Hardening", title: "Only the private store is available", def: `${POL}applicationmanagement_requireprivatestoreonly`, rule: on(), severity: "Low" },
  { cis: "18.10.65.3", area: "Windows: Hardening", title: "Store apps update automatically", def: `${POL}applicationmanagement_allowappstoreautoupdate`, rule: on() },
  { cis: "18.10.15.3", area: "Windows: Hardening", title: "OneSettings downloads are disabled", def: `${POL}system_disableonesettingsdownloads`, rule: on(), severity: "Low" },
  { cis: "18.10.15.6", area: "Windows: Hardening", title: "Diagnostic log collection is limited", def: `${POL}system_limitdiagnosticlogcollection`, rule: on(), severity: "Low" },
  { cis: "18.10.15.7", area: "Windows: Hardening", title: "Dump collection is limited", def: `${POL}system_limitdumpcollection`, rule: on(), severity: "Low" },
  { cis: "18.10.50.1", area: "Windows: Hardening", title: "Consumer OneDrive file sync is blocked", def: `${POL}system_disableonedrivefilesync`, rule: on(), severity: "Low", note: "Blocks all OneDrive sync — most organisations deliberately deviate here." },
  { cis: "18.10.92.2.2", area: "Windows: Hardening", title: "Automatic updates install every day", def: `${POL}update_scheduledinstallday`, rule: off },
  { cis: "18.10.92.4.2", area: "Windows: Hardening", title: "Feature updates deferred at least 180 days", def: `${POL}update_deferfeatureupdatesperiodindays`, rule: { t: "int", min: 180 }, note: "Update rings and feature-update profiles are legacy policy types and not inspected in this version." },
  { cis: "18.10.92.4.3", area: "Windows: Hardening", title: "Quality updates are not deferred", def: `${POL}update_deferqualityupdatesperiodindays`, rule: { t: "int", max: 0 }, note: "Update rings are a legacy policy type and not inspected in this version." },
  { cis: "18.9.7.1.1", area: "Windows: Hardening", title: "Installation of listed device IDs is blocked", def: `${POL}deviceinstallation_preventinstallationofmatchingdeviceids`, rule: on() },
  { cis: "18.9.7.1.4", area: "Windows: Hardening", title: "Installation of listed device setup classes is blocked", def: `${POL}deviceinstallation_preventinstallationofmatchingdevicesetupclasses`, rule: on() },
];

/** Check id for a Windows setting — prefixed so it never collides with an M365 CIS id (both use e.g. 1.1.1). */
export const windowsCheckId = (cis: string) => `W-${cis}`;
