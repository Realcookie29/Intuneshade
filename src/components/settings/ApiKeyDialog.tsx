import { useState } from "react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody,
  DialogContent, DialogActions, Button, Input, Text,
  makeStyles, tokens, Badge, Link, Tab, TabList, Label,
} from "@fluentui/react-components";
import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { KeyRegular, DeleteRegular, CheckmarkCircle24Regular } from "@fluentui/react-icons";
import {
  useApiKeyStore, PROVIDERS, getAzureConfig, saveAzureConfig,
} from "../../store/apiKeyStore";
import type { AiProvider } from "../../store/apiKeyStore";

const useStyles = makeStyles({
  surface: { maxWidth: "540px" },
  tabList: { marginBottom: "16px" },
  content: { display: "flex", flexDirection: "column", gap: "14px" },
  providerHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  dot: { width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0 },
  inputGroup: { display: "flex", flexDirection: "column", gap: "10px" },
  inputRow: { display: "flex", flexDirection: "column", gap: "4px" },
  input: { width: "100%" },
  activeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    background: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  activeLeft: { display: "flex", alignItems: "center", gap: "8px" },
  note: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: "1.5",
  },
});

export default function ApiKeyDialog() {
  const styles = useStyles();
  const { provider, keys, dialogOpen, setProvider, setKey, clearKey, closeDialog } = useApiKeyStore();

  const [draftKey, setDraftKey] = useState("");
  const [draftEndpoint, setDraftEndpoint] = useState(getAzureConfig()?.endpoint ?? "");
  const [draftDeployment, setDraftDeployment] = useState(getAzureConfig()?.deployment ?? "gpt-4o");

  const info = PROVIDERS.find((p) => p.id === provider)!;
  const activeKey = keys[provider];
  const isAzure = provider === "azure-openai";

  const isValid = isAzure
    ? draftKey.trim().length >= 8 &&
      draftEndpoint.trim().startsWith("https://") &&
      draftDeployment.trim().length > 0
    : draftKey.trim().startsWith(info.keyPrefix) && draftKey.trim().length > 16;

  const handleTabChange = (_: SelectTabEvent, d: SelectTabData) => {
    setProvider(d.value as AiProvider);
    setDraftKey("");
  };

  const handleSave = () => {
    if (!isValid) return;
    if (isAzure) {
      saveAzureConfig({ endpoint: draftEndpoint.trim().replace(/\/$/, ""), deployment: draftDeployment.trim() });
    }
    setKey(provider, draftKey.trim());
    setDraftKey("");
  };

  const handleClose = () => {
    setDraftKey("");
    closeDialog();
  };

  const handleClear = () => {
    clearKey(provider);
    setDraftKey("");
    if (isAzure) {
      setDraftEndpoint("");
      setDraftDeployment("gpt-4o");
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={(_, d) => { if (!d.open) handleClose(); }}>
      <DialogSurface className={styles.surface}>
        <DialogTitle>AI Provider Settings</DialogTitle>
        <DialogBody>
          <DialogContent>
            <TabList
              className={styles.tabList}
              selectedValue={provider}
              onTabSelect={handleTabChange}
            >
              {PROVIDERS.map((p) => (
                <Tab key={p.id} value={p.id}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className={styles.dot} style={{ backgroundColor: p.color }} />
                    {keys[p.id] && (
                      <CheckmarkCircle24Regular
                        style={{ fontSize: "12px", color: tokens.colorStatusSuccessForeground1 }}
                      />
                    )}
                    {p.id === "azure-openai" ? "Copilot" : p.label.split(" ")[0]}
                  </span>
                </Tab>
              ))}
            </TabList>

            <div className={styles.content}>
              {/* Provider header */}
              <div className={styles.providerHeader}>
                <span className={styles.dot} style={{ backgroundColor: info.color, width: "12px", height: "12px" }} />
                <div>
                  <Text weight="semibold">{info.label}</Text>
                  <Text size={200} block style={{ color: tokens.colorNeutralForeground3 }}>
                    Model: {info.model}
                  </Text>
                </div>
              </div>

              {/* Active state */}
              {activeKey ? (
                <div className={styles.activeRow}>
                  <div className={styles.activeLeft}>
                    <Badge color="success" appearance="filled">Active</Badge>
                    <Text size={200} style={{ fontFamily: "monospace" }}>
                      {activeKey.slice(0, 10)}••••••••••
                    </Text>
                    {isAzure && getAzureConfig() && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        · {getAzureConfig()!.deployment}
                      </Text>
                    )}
                  </div>
                  <Button appearance="subtle" icon={<DeleteRegular />} onClick={handleClear}>
                    Remove
                  </Button>
                </div>
              ) : (
                <div className={styles.inputGroup}>
                  {/* Azure OpenAI extra fields */}
                  {isAzure && (
                    <>
                      <div className={styles.inputRow}>
                        <Label size="small" weight="semibold">Azure OpenAI Endpoint</Label>
                        <Input
                          className={styles.input}
                          placeholder="https://myresource.openai.azure.com"
                          value={draftEndpoint}
                          onChange={(_, d) => setDraftEndpoint(d.value)}
                        />
                      </div>
                      <div className={styles.inputRow}>
                        <Label size="small" weight="semibold">Deployment Name</Label>
                        <Input
                          className={styles.input}
                          placeholder="gpt-4o"
                          value={draftDeployment}
                          onChange={(_, d) => setDraftDeployment(d.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* API Key */}
                  <div className={styles.inputRow}>
                    <Label size="small" weight="semibold">API Key</Label>
                    <Input
                      className={styles.input}
                      type="password"
                      placeholder={info.placeholder}
                      value={draftKey}
                      onChange={(_, d) => setDraftKey(d.value)}
                      contentBefore={<KeyRegular />}
                      onKeyDown={(e) => { if (e.key === "Enter" && isValid) handleSave(); }}
                    />
                  </div>
                </div>
              )}

              {/* Note */}
              <Text className={styles.note}>
                {isAzure
                  ? <>Find your endpoint and key in the <Link href={info.consoleUrl} target="_blank">Azure Portal</Link> under your Azure OpenAI resource → Keys and Endpoint. This is the same service that powers Microsoft Copilot for Enterprise.</>
                  : <>Get your API key at <Link href={info.consoleUrl} target="_blank">{info.consoleName}</Link>. Keys are stored only in your browser — never on any server.</>
                }
              </Text>
            </div>
          </DialogContent>

          <DialogActions>
            <Button appearance="secondary" onClick={handleClose}>
              {activeKey ? "Close" : "Cancel"}
            </Button>
            {!activeKey && (
              <Button appearance="primary" onClick={handleSave} disabled={!isValid}>
                Save
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
