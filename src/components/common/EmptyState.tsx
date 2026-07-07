import { Text, makeStyles, tokens } from "@fluentui/react-components";
import { DocumentRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "64px 24px",
    gap: "12px",
    color: tokens.colorNeutralForeground3,
  },
  icon: {
    fontSize: "48px",
  },
});

export default function EmptyState({ message = "No data found" }: { message?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <DocumentRegular className={styles.icon} />
      <Text size={400}>{message}</Text>
    </div>
  );
}
