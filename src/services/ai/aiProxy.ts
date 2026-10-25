// ─── AI proxy client ──────────────────────────────────────────────────────────
// Every call to /api/claude goes through here: the user's own provider key
// (X-Api-Key) plus their Entra ID token, which the proxy validates so it cannot
// be used anonymously as an AI relay.

import { getAzureConfig, useApiKeyStore } from "../../store/apiKeyStore";
import { getIdToken } from "../graphClient";

export class NoApiKeyError extends Error {
  constructor() {
    super("NO_API_KEY");
    this.name = "NoApiKeyError";
  }
}

export async function callAiProxy(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const { provider, apiKey } = useApiKeyStore.getState();
  if (!apiKey) throw new NoApiKeyError();
  const azure = provider === "azure-openai" ? getAzureConfig() : null;
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-IntuneShade-Token": await getIdToken(),
    },
    body: JSON.stringify({
      ...body,
      provider,
      ...(azure ? { azureEndpoint: azure.endpoint, azureDeployment: azure.deployment } : {}),
    }),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: unknown };
      if (typeof j.error === "string") msg = j.error;
    } catch { /* keep generic */ }
    throw new Error(msg);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Unexpected response from the AI proxy.");
  }
}
