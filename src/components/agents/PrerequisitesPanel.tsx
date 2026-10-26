import { useMemo } from "react";
import { Badge, Text, makeStyles, tokens } from "@fluentui/react-components";
import { ACCENTS, FONTS } from "../../theme/theme";
import { CHECKS, isWindowsArea } from "../../baseline";
import { extraScopesFor } from "../../baseline/scopes";
import { loginRequest } from "../../auth/msalConfig";
import { useBenchmarkPrefs } from "../../store/benchmarkPrefsStore";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "14px", padding: "16px", width: "460px", maxWidth: "calc(100vw - 48px)" },
  section: { display: "flex", flexDirection: "column", gap: "6px" },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  warn: { fontSize: tokens.fontSizeBase200, color: ACCENTS.amber },
  list: { margin: 0, paddingLeft: "18px", fontSize: tokens.fontSizeBase200, display: "flex", flexDirection: "column", gap: "2px" },
  scopes: { display: "flex", flexWrap: "wrap", gap: "4px" },
  mono: { fontFamily: FONTS.mono, fontSize: "11px" },
});

// Endpoints that accept no Graph scope at all, only this directory role.
const GLOBAL_ADMIN_ONLY = ["5.1.2.4"];
// Checks that need Entra ID P2 (Identity Protection, PIM, access reviews); without it they are N/A.
const P2_CHECKS = ["5.2.2.6", "5.2.2.7", "5.3.2", "5.3.3", "5.3.4", "5.3.5"];

/** What the signed-in admin and the tenant need before a benchmark, for the checks currently selected. */
export default function PrerequisitesPanel() {
  const styles = useStyles();
  const excludedChecks = useBenchmarkPrefs((s) => s.excludedChecks);
  const selected = useMemo(() => {
    const excluded = new Set(excludedChecks);
    return CHECKS.filter((c) => !excluded.has(c.id));
  }, [excludedChecks]);
  const ids = new Set(selected.map((c) => c.id));
  const extra = extraScopesFor(ids);
  const signIn = loginRequest.scopes.filter((s) => s.includes("."));
  const hasTenant = selected.some((c) => !isWindowsArea(c.area));
  const hasWindows = selected.some((c) => isWindowsArea(c.area));
  const gaOnly = GLOBAL_ADMIN_ONLY.filter((id) => ids.has(id));
  const p2 = P2_CHECKS.filter((id) => ids.has(id));

  return (
    <div className={styles.root}>
      <div>
        <Text weight="semibold" block>Prerequisites</Text>
        <Text className={styles.hint}>
          For the {selected.length} selected checks. The benchmark only reads (GET); nothing is changed in the tenant.
        </Text>
      </div>

      <div className={styles.section}>
        <Text weight="semibold" size={200}>1. Sign in with a read role</Text>
        <ul className={styles.list}>
          <li><b>Global Reader</b> — recommended; reads everything the benchmark needs{gaOnly.length ? " except the check below" : ""}.</li>
          {hasWindows && !hasTenant && <li>Windows settings only: <b>Intune Read Only Operator</b> is enough.</li>}
          <li>Delegated permissions only work as far as your role allows: a missing role shows up as Error or Manual, never as Fail.</li>
        </ul>
        {gaOnly.length > 0 && (
          <Text className={styles.warn}>
            {gaOnly.join(", ")} can only be read by a <b>Global Administrator</b> (Microsoft offers no Graph permission for it).
            With any other role it comes back as Manual.
          </Text>
        )}
      </div>

      <div className={styles.section}>
        <Text weight="semibold" size={200}>2. Admin consent (once per tenant)</Text>
        <Text className={styles.hint}>
          IntuneShade is a multi-tenant app. A <b>Global Administrator</b> or <b>Privileged Role Administrator</b> grants
          these read-only delegated permissions once for the organisation; after that any admin with a read role can run it.
        </Text>
        <Text size={200}>At sign-in:</Text>
        <div className={styles.scopes}>
          {signIn.map((s) => <Badge key={s} appearance="outline" className={styles.mono}>{s}</Badge>)}
        </div>
        <Text size={200}>Extra, requested on the first run{extra.length ? "" : " — none for this selection"}:</Text>
        {extra.length > 0 && (
          <div className={styles.scopes}>
            {extra.map((s) => <Badge key={s} appearance="tint" color="brand" className={styles.mono}>{s}</Badge>)}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <Text weight="semibold" size={200}>3. Licences</Text>
        <ul className={styles.list}>
          {hasTenant && <li><b>Entra ID P1</b> for the Conditional Access checks.</li>}
          {p2.length > 0 && <li><b>Entra ID P2</b> for {p2.join(", ")} (Identity Protection, PIM, access reviews) — without it these are N/A.</li>}
          {hasWindows && <li><b>Microsoft Intune</b> for the Windows settings; the deployment-profile scope needs Windows Autopilot.</li>}
        </ul>
      </div>
    </div>
  );
}
