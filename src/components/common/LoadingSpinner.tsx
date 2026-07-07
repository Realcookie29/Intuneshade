import { Spinner, makeStyles } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "48px",
    width: "100%",
  },
});

export default function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <Spinner label={label} />
    </div>
  );
}
