import { makeStyles, tokens, Text } from "@fluentui/react-components";
import { ACCENTS, FONTS } from "../../theme/theme";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "24px",
    flexWrap: "wrap",
    padding: "22px 28px 20px",
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    position: "relative",
  },
  accent: {
    position: "absolute",
    left: 0,
    top: "20px",
    bottom: "16px",
    width: "3px",
    borderRadius: "0 2px 2px 0",
    backgroundColor: ACCENTS.amber,
  },
  left: { display: "flex", gap: "16px", alignItems: "flex-start", minWidth: 0 },
  iconChip: {
    flexShrink: 0,
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colorNeutralBackground4,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: ACCENTS.amber,
    fontSize: "22px",
  },
  text: { display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 },
  eyebrow: {
    fontFamily: FONTS.mono,
    fontSize: "11px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: ACCENTS.amber,
    fontWeight: 600,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: "26px",
    lineHeight: "1.1",
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
    letterSpacing: "-0.01em",
  },
  subtitle: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    maxWidth: "620px",
  },
  actions: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 },
});

interface Props {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, eyebrow, icon, actions }: Props) {
  const styles = useStyles();
  return (
    <header className={styles.root}>
      <span className={styles.accent} />
      <div className={styles.left}>
        {icon && <div className={styles.iconChip}>{icon}</div>}
        <div className={styles.text}>
          {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
          <Text as="h1" className={styles.title}>{title}</Text>
          {subtitle && <Text className={styles.subtitle}>{subtitle}</Text>}
        </div>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
