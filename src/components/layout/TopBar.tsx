import { useMsal } from "@azure/msal-react";
import { Button, Text, Avatar, makeStyles, tokens, Tooltip } from "@fluentui/react-components";
import {
  SignOutRegular, KeyRegular, Key24Filled, WeatherMoonRegular, WeatherSunnyRegular,
} from "@fluentui/react-icons";
import { useApiKeyStore, PROVIDERS } from "../../store/apiKeyStore";
import { useThemeStore } from "../../store/themeStore";
import ApiKeyDialog from "../settings/ApiKeyDialog";
import Logo from "./Logo";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    height: "56px",
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  user: { display: "flex", alignItems: "center", gap: "8px" },
  divider: {
    width: "1px",
    height: "24px",
    backgroundColor: tokens.colorNeutralStroke2,
    margin: "0 4px",
  },
  userName: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    maxWidth: "180px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export default function TopBar() {
  const { instance, accounts } = useMsal();
  const styles = useStyles();
  const account = accounts[0];
  const { apiKey, provider, openDialog } = useApiKeyStore();
  const { mode, toggle } = useThemeStore();
  const providerInfo = PROVIDERS.find((p) => p.id === provider)!;

  const handleLogout = () => {
    instance.logoutRedirect({ account, postLogoutRedirectUri: window.location.origin });
  };

  return (
    <>
      <div className={styles.root}>
        <Logo />
        <div className={styles.user}>
          {account && (
            <>
              <Avatar name={account.name ?? account.username} size={28} color="colorful" />
              <Text className={styles.userName}>{account.name ?? account.username}</Text>
            </>
          )}
          <span className={styles.divider} />

          <Tooltip content={mode === "dark" ? "Switch to light" : "Switch to dark"} relationship="label">
            <Button
              appearance="subtle"
              icon={mode === "dark" ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
              onClick={toggle}
              aria-label="Toggle theme"
            />
          </Tooltip>

          <Tooltip
            content={apiKey ? `AI: ${providerInfo.label} — click to change` : "Configure AI provider for AI features"}
            relationship="label"
          >
            <Button
              appearance="subtle"
              onClick={openDialog}
              icon={apiKey ? <Key24Filled style={{ color: "#3DDC97" }} /> : <KeyRegular />}
            >
              {apiKey && (
                <Text style={{ fontSize: tokens.fontSizeBase200 }}>
                  {providerInfo.label.split(" ")[0]}
                </Text>
              )}
            </Button>
          </Tooltip>

          <Button appearance="subtle" icon={<SignOutRegular />} onClick={handleLogout} title="Sign out">
            Sign out
          </Button>
        </div>
      </div>
      <ApiKeyDialog />
    </>
  );
}
