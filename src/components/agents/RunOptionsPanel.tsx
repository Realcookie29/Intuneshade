import { useEffect, useState } from "react";
import { Button, Input, Spinner, Switch, Text, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, DismissRegular, SearchRegular } from "@fluentui/react-icons";
import { ACCENTS, FONTS } from "../../theme/theme";
import { graphGet } from "../../services/graphClient";
import { useBenchmarkPrefs } from "../../store/benchmarkPrefsStore";
import type { BreakGlassAccount } from "../../baseline/types";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "14px", padding: "16px", width: "420px", maxWidth: "calc(100vw - 48px)" },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  list: { display: "flex", flexDirection: "column", gap: "4px" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    borderRadius: "6px",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  upn: { fontFamily: FONTS.mono, fontSize: "12px", color: tokens.colorNeutralForeground3, display: "block" },
  grow: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  warn: { fontSize: tokens.fontSizeBase200, color: ACCENTS.amber },
  err: { fontSize: tokens.fontSizeBase200, color: ACCENTS.danger },
});

/** OData string literal: single quotes are doubled. */
const odata = (s: string) => s.replace(/'/g, "''");

/** Break-glass accounts and scan options for the CIS benchmark. Stored in this browser only. */
export default function RunOptionsPanel() {
  const styles = useStyles();
  const breakGlass = useBenchmarkPrefs((s) => s.breakGlass);
  const fullScan = useBenchmarkPrefs((s) => s.fullPerUserMfaScan);
  const { addBreakGlass, removeBreakGlass, setFullScan } = useBenchmarkPrefs.getState();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BreakGlassAccount[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const f = `startswith(userPrincipalName,'${odata(q)}') or startswith(displayName,'${odata(q)}')`;
        const res = await graphGet<{ value: BreakGlassAccount[] }>(
          `/v1.0/users?$filter=${encodeURIComponent(f)}&$select=id,displayName,userPrincipalName&$top=10`,
        );
        if (!cancelled) setHits(res.value ?? []);
      } catch (err) {
        if (!cancelled) setError((err as Error).message.slice(0, 160));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const shown = query.trim().length >= 2 ? hits.filter((h) => !breakGlass.some((b) => b.id === h.id)) : [];

  return (
    <div className={styles.root}>
      <div>
        <Text weight="semibold" block>Break-glass accounts</Text>
        <Text className={styles.hint}>
          Emergency-access accounts may be excluded from Conditional Access. Tag them here so those exclusions are not
          counted against you, and so check 1.1.2 can verify them. CIS expects at least two.
        </Text>
      </div>
      {breakGlass.length > 0 && (
        <div className={styles.list}>
          {breakGlass.map((b) => (
            <div key={b.id} className={styles.row}>
              <span className={styles.grow}>
                {b.displayName}
                <span className={styles.upn}>{b.userPrincipalName}</span>
              </span>
              <Button size="small" appearance="subtle" icon={<DismissRegular />} aria-label={`Remove ${b.displayName}`} onClick={() => removeBreakGlass(b.id)} />
            </div>
          ))}
        </div>
      )}
      {breakGlass.length === 1 && <Text className={styles.warn}>Only one break-glass account tagged; CIS expects two.</Text>}
      <Input
        contentBefore={<SearchRegular />}
        contentAfter={searching ? <Spinner size="extra-tiny" /> : undefined}
        placeholder="Search a user by name or UPN…"
        value={query}
        onChange={(_, d) => setQuery(d.value)}
      />
      {error && <Text className={styles.err}>{error}</Text>}
      {shown.length > 0 && (
        <div className={styles.list}>
          {shown.map((h) => (
            <div key={h.id} className={styles.row}>
              <span className={styles.grow}>
                {h.displayName}
                <span className={styles.upn}>{h.userPrincipalName}</span>
              </span>
              <Button
                size="small"
                icon={<AddRegular />}
                onClick={() => { addBreakGlass({ id: h.id, displayName: h.displayName, userPrincipalName: h.userPrincipalName }); setQuery(""); setHits([]); }}
              >
                Tag
              </Button>
            </div>
          ))}
        </div>
      )}
      <div>
        <Switch
          checked={fullScan}
          onChange={(_, d) => setFullScan(d.checked)}
          label="Full per-user MFA scan (5.1.2.1)"
        />
        <Text className={styles.hint} block>
          By default only privileged users are checked for legacy per-user MFA. A full scan reads every user, which can
          take minutes in large tenants.
        </Text>
      </div>
      <Text className={styles.hint}>These settings stay in this browser. Nothing is written to the tenant.</Text>
    </div>
  );
}
