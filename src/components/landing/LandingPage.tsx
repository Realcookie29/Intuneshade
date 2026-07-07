import { useMsal } from "@azure/msal-react";
import { makeStyles } from "@fluentui/react-components";
import { loginRequest } from "../../auth/msalConfig";
import { LogoMark } from "../layout/Logo";
import DemoReel from "./DemoReel";

const GITHUB_URL = "https://github.com/Realcookie29/Intuneshade";
const LINKEDIN_URL = "https://www.linkedin.com/in/alper-a-335a55137/";

// Warm-enterprise tokens: muted neutrals, one amber signal, the product's own
// include/exclude greens & reds. No purple gradients, no glassmorphism.
const C = {
  bg: "#FAF9F6",
  bgAlt: "#F1EEE7",
  ink: "#201D19",
  ink2: "#57524B",
  ink3: "#8A847A",
  line: "#E6E1D8",
  lineSoft: "#EFEBE3",
  amber: "#B26A00",
  amberSoft: "#F6EDDC",
  include: "#1F8F63",
  surface: "#FFFFFF",
};
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const UI = "'Inter', system-ui, sans-serif";

const FEATURES: { name: string; desc: string; tag: string }[] = [
  { name: "Assignment Matrix", desc: "Every group × policy type in a single grid you can search and drill into.", tag: "visualize" },
  { name: "Device Compliance", desc: "See how many devices are compliant, why the rest aren't, and which need attention.", tag: "monitor" },
  { name: "Assignment Report", desc: "A polished, self-contained HTML report you can share, archive or print.", tag: "export" },
  { name: "Device & User Compare", desc: "See precisely what two devices, or a device and a user, each receive.", tag: "analyze" },
  { name: "Conflict Detection", desc: "Surface overlapping and contradictory assignments before they cause drift.", tag: "analyze" },
  { name: "Autopilot Group Tags", desc: "Bulk-assign or change Windows Autopilot group tags from a CSV or the device list.", tag: "manage" },
  { name: "Bulk Assign", desc: "Assign, exclude or clean up group assignments across many policies at once.", tag: "manage" },
  { name: "Group Membership", desc: "Add and remove members across security groups without switching tools.", tag: "manage" },
  { name: "Backup & Restore", desc: "Snapshot your policies to JSON and restore them when you need to roll back.", tag: "protect" },
  { name: "AI Analysis", desc: "Explain assignments and draft remediation scripts with your own AI key.", tag: "assist" },
];

const useStyles = makeStyles({
  page: { minHeight: "100vh", height: "100vh", overflowY: "auto", background: C.bg, color: C.ink, fontFamily: UI },
  inner: { maxWidth: "1180px", margin: "0 auto", padding: "0 32px" },

  nav: {
    position: "sticky", top: 0, zIndex: 20, background: "rgba(250,249,246,0.86)",
    backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`,
  },
  navInner: { maxWidth: "1180px", margin: "0 auto", padding: "0 32px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", gap: "10px" },
  brandName: { fontFamily: UI, fontWeight: 600, fontSize: "15.5px", letterSpacing: "-0.01em", color: C.ink },
  navRight: { display: "flex", alignItems: "center", gap: "10px" },
  ghost: {
    fontFamily: UI, fontSize: "13.5px", color: C.ink2, background: "transparent",
    border: `1px solid ${C.line}`, borderRadius: "8px", padding: "8px 14px", cursor: "pointer",
    ":hover": { border: `1px solid ${C.amber}`, color: C.ink },
  },
  amber: {
    fontFamily: UI, fontWeight: 600, color: "#FFFFFF", background: C.amber, border: "none",
    borderRadius: "8px", cursor: "pointer", padding: "8px 16px", fontSize: "13.5px",
    ":hover": { background: "#9A5C00" },
  },
  amberLg: {
    fontFamily: UI, fontWeight: 600, color: "#FFFFFF", background: C.amber, border: "none",
    borderRadius: "8px", cursor: "pointer", height: "46px", padding: "0 22px", fontSize: "15px",
    ":hover": { background: "#9A5C00" },
  },

  hero: {
    display: "grid", gridTemplateColumns: "minmax(0, 0.92fr) minmax(0, 1.08fr)", gap: "48px",
    alignItems: "center", padding: "72px 0 64px",
  },
  eyebrow: {
    fontFamily: MONO, fontSize: "12px", letterSpacing: "0.14em", textTransform: "uppercase",
    color: C.amber, display: "inline-block", marginBottom: "20px",
  },
  h1: { fontFamily: UI, fontWeight: 600, fontSize: "clamp(34px, 4.6vw, 52px)", lineHeight: "1.06", letterSpacing: "-0.032em", color: C.ink, margin: 0 },
  lede: { color: C.ink2, fontSize: "17.5px", lineHeight: "1.62", marginTop: "20px", maxWidth: "520px" },
  ctaRow: { display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "28px" },
  jsonBtn: {
    height: "46px", paddingLeft: "18px", paddingRight: "18px", fontSize: "15px", fontFamily: UI, cursor: "pointer",
    background: C.surface, color: C.ink, border: `1px solid ${C.line}`, borderRadius: "8px", fontWeight: 500,
    display: "inline-flex", alignItems: "center", gap: "8px",
    ":hover": { border: `1px solid ${C.amber}` },
  },
  trust: { display: "flex", gap: "22px", flexWrap: "wrap", marginTop: "30px" },
  trustItem: { display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: MONO, fontSize: "12px", color: C.ink3 },
  check: { color: C.include, fontWeight: 700 },

  // Features: editorial two-column with hairline rows (no card grid, no numbering)
  featSection: { background: C.bgAlt, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` },
  featGrid: { display: "grid", gridTemplateColumns: "300px 1fr", gap: "48px", padding: "72px 0" },
  featAside: { position: "sticky", top: "96px", alignSelf: "start" },
  featKicker: { fontFamily: MONO, fontSize: "12px", letterSpacing: "0.14em", textTransform: "uppercase", color: C.amber },
  featHead: { fontFamily: UI, fontWeight: 600, fontSize: "27px", lineHeight: "1.15", letterSpacing: "-0.02em", margin: "14px 0 12px", color: C.ink },
  featSub: { color: C.ink2, fontSize: "15px", lineHeight: "1.6" },
  featList: { display: "flex", flexDirection: "column" },
  featRow: {
    display: "grid", gridTemplateColumns: "1fr auto", gap: "16px 20px", alignItems: "baseline",
    padding: "20px 0", borderTop: `1px solid ${C.line}`,
  },
  featName: { fontFamily: UI, fontWeight: 600, fontSize: "17px", color: C.ink, gridColumn: "1" },
  featTag: { fontFamily: MONO, fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.08em", color: C.amber, background: C.amberSoft, padding: "3px 9px", borderRadius: "999px", justifySelf: "end", alignSelf: "center", whiteSpace: "nowrap" },
  featDesc: { color: C.ink2, fontSize: "14.5px", lineHeight: "1.55", gridColumn: "1 / -1" },

  // Security & access: three trust pillars
  security: { padding: "72px 0" },
  secHead: { maxWidth: "660px", margin: "0 auto 40px", textAlign: "center" },
  secKicker: { fontFamily: MONO, fontSize: "12px", letterSpacing: "0.14em", textTransform: "uppercase", color: C.amber },
  secTitle: { fontFamily: UI, fontWeight: 600, fontSize: "clamp(24px, 3vw, 30px)", lineHeight: "1.16", letterSpacing: "-0.022em", margin: "14px 0 12px", color: C.ink },
  secSub: { color: C.ink2, fontSize: "15.5px", lineHeight: "1.62" },
  pillars: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px",
    "@media (max-width: 860px)": { gridTemplateColumns: "1fr" },
  },
  pillar: {
    display: "flex", flexDirection: "column", gap: "12px", padding: "26px 24px",
    background: C.surface, border: `1px solid ${C.line}`, borderRadius: "14px",
  },
  pillarIcon: {
    width: "40px", height: "40px", borderRadius: "11px", background: C.amberSoft, color: C.amber,
    display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: "19px", fontWeight: 700,
  },
  pillarTitle: { fontFamily: UI, fontWeight: 600, fontSize: "16.5px", letterSpacing: "-0.01em", color: C.ink },
  pillarText: { color: C.ink2, fontSize: "14px", lineHeight: "1.62" },
  scopeNote: {
    maxWidth: "760px", margin: "30px auto 0", textAlign: "center",
    fontFamily: MONO, fontSize: "11.5px", color: C.ink3, lineHeight: "1.75",
  },

  // Footer
  footer: { background: C.ink, color: "#D8D4CC", padding: "56px 0 30px" },
  footTop: { display: "grid", gridTemplateColumns: "1.7fr 1fr 1fr 1fr", gap: "32px" },
  footBrandName: { fontFamily: UI, fontWeight: 600, fontSize: "15.5px", color: "#F4F1EA" },
  footTag: { color: "#9A948A", fontSize: "13.5px", lineHeight: "1.6", maxWidth: "300px", marginTop: "12px" },
  footPill: { display: "inline-flex", alignItems: "center", gap: "7px", marginTop: "16px", fontFamily: MONO, fontSize: "11px", color: "#E0B877", border: "1px solid rgba(178,106,0,0.4)", borderRadius: "999px", padding: "4px 11px" },
  footColTitle: { fontFamily: MONO, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#7C766C", marginBottom: "14px", display: "block" },
  footLink: { display: "block", color: "#B7B1A7", fontSize: "14px", textDecoration: "none", padding: "5px 0", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: UI, ":hover": { color: "#F4F1EA" } },
  footNote: { color: "#7C766C", fontSize: "13px", lineHeight: "1.6" },
  footBottom: { marginTop: "40px", paddingTop: "22px", borderTop: "1px solid #302B24", display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", color: "#6E685E", fontSize: "12.5px", lineHeight: "1.6" },
});

export default function LandingPage() {
  const { instance } = useMsal();
  const styles = useStyles();
  const signIn = () => instance.loginRedirect(loginRequest);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.brand}>
            <LogoMark size={30} />
            <span className={styles.brandName}>IntuneShade</span>
          </div>
          <div className={styles.navRight}>
            <button className={styles.ghost} onClick={() => scrollTo("features")}>Features</button>
            <button className={styles.ghost} onClick={() => scrollTo("security")}>Security</button>
            <button className={styles.amber} onClick={signIn}>Sign in</button>
          </div>
        </div>
      </nav>

      {/* Hero: the product's own artifact is the thesis */}
      <div className={styles.inner}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Mission Control for Microsoft Intune</span>
            <h1 className={styles.h1}>See and control your whole Intune tenant.</h1>
            <p className={styles.lede}>
              A fast, browser-based console for Microsoft Intune, covering assignments, device
              compliance, Autopilot tags, reports and more across your entire tenant. Sign in with
              your Microsoft 365 admin account and IntuneShade acts as you through the Microsoft
              Graph API, with no install and nothing to set up.
            </p>
            <div className={styles.ctaRow}>
              <button className={styles.amberLg} onClick={signIn}>Sign in with Microsoft</button>
            </div>
            <div className={styles.trust}>
              <span className={styles.trustItem}><span className={styles.check}>✓</span> Delegated access only</span>
              <span className={styles.trustItem}><span className={styles.check}>✓</span> No secrets to manage</span>
              <span className={styles.trustItem}><span className={styles.check}>✓</span> Data stays in your browser</span>
            </div>
          </div>
          <DemoReel />
        </section>
      </div>

      {/* Features */}
      <section id="features" className={styles.featSection}>
        <div className={styles.inner}>
          <div className={styles.featGrid}>
            <aside className={styles.featAside}>
              <span className={styles.featKicker}>What's inside</span>
              <h2 className={styles.featHead}>A full console, not just a diff.</h2>
              <p className={styles.featSub}>
                Most Intune tools stop at read-only comparison. This one lets you see, act and
                report, with the read-write pieces and the read-only ones in one place.
              </p>
            </aside>
            <div className={styles.featList}>
              {FEATURES.map((f) => (
                <div key={f.name} className={styles.featRow}>
                  <span className={styles.featName}>{f.name}</span>
                  <span className={styles.featTag}>{f.tag}</span>
                  <span className={styles.featDesc}>{f.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security & access */}
      <section id="security" className={styles.security}>
        <div className={styles.inner}>
          <div className={styles.secHead}>
            <span className={styles.secKicker}>Security &amp; access</span>
            <h2 className={styles.secTitle}>Delegated access only, straight to the Microsoft Graph API.</h2>
            <p className={styles.secSub}>
              IntuneShade never asks you to register an app or hand over a secret. It signs in as
              the administrator in front of it and talks directly to Microsoft Graph with your own token.
            </p>
          </div>

          <div className={styles.pillars}>
            <div className={styles.pillar}>
              <span className={styles.pillarIcon}>◑</span>
              <span className={styles.pillarTitle}>Acts as you, not as an app</span>
              <p className={styles.pillarText}>
                Every read and write runs under your signed-in account through delegated Graph
                permissions, honoring your existing Entra ID roles and Intune RBAC. You can't do
                anything here you couldn't already do in the Intune portal.
              </p>
            </div>
            <div className={styles.pillar}>
              <span className={styles.pillarIcon}>⊘</span>
              <span className={styles.pillarTitle}>Delegated permissions only</span>
              <p className={styles.pillarText}>
                You never build an app registration or manage a client secret. Granting consent adds
                a standard enterprise application to your tenant that you can review and revoke in
                Entra ID at any time, and it only ever acts with delegated permissions, never
                application permissions.
              </p>
            </div>
            <div className={styles.pillar}>
              <span className={styles.pillarIcon}>◗</span>
              <span className={styles.pillarTitle}>Data stays in your browser</span>
              <p className={styles.pillarText}>
                A client-side app: your policies, groups and assignments are fetched directly from
                Graph and rendered locally. There's no backend that stores your tenant data, and the
                JSON explorer runs entirely offline.
              </p>
            </div>
          </div>

          <p className={styles.scopeNote}>
            Requests delegated Graph scopes such as DeviceManagementConfiguration, DeviceManagementApps,
            DeviceManagementManagedDevices, Group and Directory.Read.All. These are the same permissions
            your admin role already carries, and nothing runs with application permissions.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.inner}>
          <div className={styles.footTop}>
            <div>
              <div className={styles.brand}>
                <LogoMark size={28} />
                <span className={styles.footBrandName}>IntuneShade</span>
              </div>
              <p className={styles.footTag}>
                See, compare, report and manage every group assignment across your Microsoft
                Intune tenant.
              </p>
              <span className={styles.footPill}>✓ Free for personal, work &amp; commercial use</span>
            </div>
            <div>
              <span className={styles.footColTitle}>Product</span>
              <button className={styles.footLink} onClick={() => scrollTo("features")}>Features</button>
              <button className={styles.footLink} onClick={signIn}>Sign in</button>
            </div>
            <div>
              <span className={styles.footColTitle}>Resources</span>
              <a className={styles.footLink} href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
              <a className={styles.footLink} href={LINKEDIN_URL} target="_blank" rel="noreferrer">LinkedIn (Alper Atar)</a>
              <a className={styles.footLink} href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer">Report an issue</a>
              <a className={styles.footLink} href="mailto:info@alperatar.nl">Contact</a>
            </div>
            <div>
              <span className={styles.footColTitle}>Trust</span>
              <p className={styles.footNote}>
                Reads and writes your tenant only with your consent. No server-side storage of
                your data.
              </p>
            </div>
          </div>
          <div className={styles.footBottom}>
            <span>© 2026 IntuneShade · Built by Alper Atar.</span>
            <span>
              Not affiliated with, endorsed by or sponsored by Microsoft. “Microsoft”, “Intune”
              and “Microsoft 365” are trademarks of Microsoft Corporation.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
