import { useState } from "react";
import {
  Button,
  Dropdown,
  Input,
  Option,
  Radio,
  RadioGroup,
  Switch,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular, PlugConnectedRegular } from "@fluentui/react-icons";
import { ACCENTS, FONTS } from "../../theme/theme";
import { useAgentModelStore, OLLAMA_URLS, type AgentEngine, type OllamaUrl } from "../../store/agentModelStore";
import { useApiKeyStore, PROVIDERS } from "../../store/apiKeyStore";
import { listOllamaModels } from "../../services/ai/provider";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "14px", padding: "16px", maxWidth: "460px" },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  code: {
    fontFamily: FONTS.mono,
    fontSize: "12px",
    backgroundColor: tokens.colorNeutralBackground3,
    padding: "8px 10px",
    borderRadius: "6px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  ok: { color: ACCENTS.mint, display: "flex", alignItems: "center", gap: "4px", fontSize: tokens.fontSizeBase200 },
  err: { color: ACCENTS.danger, fontSize: tokens.fontSizeBase200 },
});

/** Picks the model the Advisor and Reporter agents use. */
export default function ModelSettingsPanel() {
  const styles = useStyles();
  const { engine, ollamaUrl, ollamaModel, maskNames, set } = useAgentModelStore();
  const { provider, apiKey, openDialog } = useApiKeyStore();
  const providerLabel = PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
  const [models, setModels] = useState<string[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function test() {
    setTesting(true);
    setTestError(null);
    try {
      const list = await listOllamaModels(ollamaUrl);
      setModels(list);
      if (list.length && !list.includes(ollamaModel)) set({ ollamaModel: list[0] });
    } catch {
      setModels(null);
      setTestError("Could not reach Ollama. Is it running, and is OLLAMA_ORIGINS set (see below)?");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className={styles.root}>
      <Text weight="semibold">Model for the Advisor and Reporter agents</Text>
      <Text className={styles.hint}>
        Collector and Assessor never use AI. Their results are deterministic. Only the findings, never raw tenant data, reach the model you pick here.
      </Text>

      <RadioGroup value={engine} onChange={(_, d) => set({ engine: d.value as AgentEngine })}>
        <Radio value="static" label="Built-in rules (no AI)" />
        <Radio value="ollama" label="Local model via Ollama: nothing leaves this device" />
        <Radio value="byok" label="Your own API key (BYO key)" />
      </RadioGroup>

      {engine === "byok" && (
        <>
          <Text className={styles.hint}>
            Uses the provider and key from the key icon in the top bar ({providerLabel}). You pay your provider directly; IntuneShade never stores your key on a server.
          </Text>
          <div className={styles.row}>
            {apiKey
              ? <span className={styles.ok}><CheckmarkCircleRegular /> Key configured for {providerLabel}</span>
              : <span className={styles.err}>No key configured yet</span>}
            <Button size="small" onClick={openDialog}>{apiKey ? "Change key" : "Add key"}</Button>
          </div>
          <Switch
            checked={maskNames}
            onChange={(_, d) => set({ maskNames: d.checked })}
            label="Mask policy and user names before sending"
          />
        </>
      )}

      {engine === "ollama" && (
        <>
          <div className={styles.row}>
            <Dropdown
              value={ollamaUrl}
              selectedOptions={[ollamaUrl]}
              onOptionSelect={(_, d) => set({ ollamaUrl: d.optionValue as OllamaUrl })}
              style={{ minWidth: "200px" }}
            >
              {OLLAMA_URLS.map((u) => <Option key={u} value={u}>{u}</Option>)}
            </Dropdown>
            <Button size="small" icon={<PlugConnectedRegular />} onClick={test} disabled={testing}>
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>
          {testError && <Text className={styles.err}>{testError}</Text>}
          {models && (
            models.length ? (
              <Dropdown
                value={ollamaModel}
                selectedOptions={[ollamaModel]}
                onOptionSelect={(_, d) => d.optionValue && set({ ollamaModel: d.optionValue })}
              >
                {models.map((m) => <Option key={m} value={m}>{m}</Option>)}
              </Dropdown>
            ) : <Text className={styles.err}>Connected, but no models installed. Run: ollama pull qwen2.5:7b</Text>
          )}
          {!models && (
            <Input value={ollamaModel} onChange={(_, d) => set({ ollamaModel: d.value.trim() })} placeholder="qwen2.5:7b" />
          )}
          <Text className={styles.hint}>One-time setup: allow this site to talk to your local Ollama, then restart Ollama.</Text>
          <div className={styles.code}>
            {`# macOS\nlaunchctl setenv OLLAMA_ORIGINS "${window.location.origin}"\n# Windows (PowerShell)\nsetx OLLAMA_ORIGINS "${window.location.origin}"`}
          </div>
        </>
      )}
    </div>
  );
}
