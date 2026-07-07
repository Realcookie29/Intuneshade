import { makeStyles, tokens } from "@fluentui/react-components";
import { ACCENTS, FONTS } from "../../theme/theme";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#12141C" stroke="#2A3040" />
      {/* Two overlapping "shades" — the blend in the middle is the signature. */}
      <circle cx="12.5" cy="16" r="7.6" fill={ACCENTS.iris} fillOpacity="0.72" />
      <circle cx="19.5" cy="16" r="7.6" fill={ACCENTS.amber} fillOpacity="0.72" />
      <circle cx="16" cy="16" r="2" fill="#FFF3DC" fillOpacity="0.9" />
    </svg>
  );
}

const useStyles = makeStyles({
  root: { display: "flex", alignItems: "center", gap: "10px" },
  words: { display: "flex", flexDirection: "column", lineHeight: "1" },
  name: {
    fontFamily: FONTS.display,
    fontWeight: 600,
    fontSize: "15px",
    letterSpacing: "-0.01em",
    color: tokens.colorNeutralForeground1,
  },
  tag: {
    fontFamily: FONTS.mono,
    fontSize: "9.5px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: ACCENTS.amber,
    marginTop: "2px",
  },
});

export default function Logo({ size = 30 }: { size?: number }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <LogoMark size={size} />
      <div className={styles.words}>
        <span className={styles.name}>IntuneShade</span>
        <span className={styles.tag}>Mission Control</span>
      </div>
    </div>
  );
}
