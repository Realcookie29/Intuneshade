// ─── Agent orchestrator ───────────────────────────────────────────────────────
// Runs the four agents as a pipeline — Collector → Assessor → Advisor → Reporter —
// and narrates every step into agentRunStore for the "Place for your agents" page.

import { CHECKS, countStates, isWindowsArea, runCheck, sharedSourcesFor } from "../../baseline";
import { extraScopesFor } from "../../baseline/scopes";
import type { CheckResult } from "../../baseline/types";
import { useAgentRunStore, type AgentId } from "../../store/agentRunStore";
import { useAgentModelStore } from "../../store/agentModelStore";
import { useBenchmarkPrefs } from "../../store/benchmarkPrefsStore";
import { ensureScopes, getTenantName } from "../graphClient";
import { loginRequest } from "../../auth/msalConfig";
import { currentModel } from "../ai/provider";
import { isCoManaged } from "../../baseline/checks/intune";
import { describeWindowsScope, windowsInventorySummary } from "../../baseline/checks/windows";
import { collectShared, createGraphContext } from "./collector";
import { advise, NEEDS_ADVICE } from "./advisor";
import { buildReport } from "./reporter";

let controller: AbortController | null = null;

export function cancelBenchmark() {
  controller?.abort();
}

export async function runBenchmark(): Promise<void> {
  const store = useAgentRunStore.getState();
  if (store.running) return;
  store.reset();
  store.start();
  controller = new AbortController();
  const signal = controller.signal;

  const { updateAgent, addLog, handOff, setResults } = useAgentRunStore.getState();
  const model = currentModel();
  const { maskNames } = useAgentModelStore.getState();
  const { breakGlass, fullPerUserMfaScan, manualAnswers, excludedChecks, deviceScope } = useBenchmarkPrefs.getState();
  const excluded = new Set(excludedChecks);
  const checks = CHECKS.filter((c) => !excluded.has(c.id));
  const extraScopes = extraScopesFor(checks.map((c) => c.id));
  const scopes = [...loginRequest.scopes, ...extraScopes];
  const windowsCount = checks.filter((c) => isWindowsArea(c.area)).length;
  const useAi = model.engine !== "static";
  const mask = model.leavesDevice && maskNames;
  let current: AgentId = "collector";

  try {
    // ── Collector ──────────────────────────────────────────────────────────────
    updateAgent("collector", { status: "working", task: "Requesting read access", progress: 0 });
    if (!checks.length) throw new Error("No checks selected — choose at least one under Checks.");
    addLog("collector", "info", extraScopes.length
      ? `Checking read permissions for ${checks.length} selected checks: ${extraScopes.join(", ")}`
      : `Checking read permissions — the ${checks.length} selected checks need no extra permissions.`);
    if ((await ensureScopes(scopes, "agents")) === "redirecting") {
      addLog("collector", "info", "Redirecting to Microsoft to consent to read-only permissions…");
      useAgentRunStore.getState().finish();
      return;
    }
    addLog("collector", "info", "Starting read-only collection. Only GET requests — no changes are made to the tenant.");
    const ctx = createGraphContext({ breakGlass, fullPerUserMfaScan, deviceScope }, scopes, (path) => addLog(current, "graph", `GET ${path}`));
    const okCount = await collectShared(ctx, sharedSourcesFor(checks, extraScopes), {
      signal,
      onRequest: () => {},
      onSource: (i, total, label) => updateAgent("collector", { task: `Reading ${label}`, progress: i / total }),
      onSourceDone: (label, ok, detail) => addLog("collector", ok ? "info" : "warn", `${label}: ${detail}`),
    });
    if (windowsCount) {
      updateAgent("collector", { task: deviceScope.kind === "profile" ? `Resolving devices of “${deviceScope.name}”` : "Reading Windows policy inventory", progress: 0.9 });
      const inv = await windowsInventorySummary(ctx);
      addLog("collector", inv.ok ? "info" : "warn", `Windows policies: ${inv.text}`);
      for (const w of inv.warnings) addLog("collector", "warn", w);
      addLog("collector", "info", `Windows settings scope: ${await describeWindowsScope(ctx)}. Only assigned policies count — configuration intent, not device state.`);
    }
    updateAgent("collector", { status: "done", task: "Shared data read", progress: 1, output: `${okCount} sources read` });
    handOff("collector", "assessor", `${okCount} sources`);

    // ── Assessor ───────────────────────────────────────────────────────────────
    current = "assessor";
    updateAgent("assessor", { status: "working", task: "Loading CIS L1 checks", progress: 0 });
    addLog("assessor", "info", `Evaluating ${checks.length} of ${CHECKS.length} CIS L1 checks (${checks.length - windowsCount} tenant, ${windowsCount} Windows device settings) — deterministic rules, no AI.`);
    if (!breakGlass.length && checks.some((c) => c.area === "Conditional Access")) addLog("assessor", "warn", "No break-glass accounts set — CA exclusions cannot be told apart from emergency access (see Run options).");
    const results: CheckResult[] = [];
    for (const [i, check] of checks.entries()) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      updateAgent("assessor", { task: `${check.id} · ${check.title}`, progress: i / checks.length });
      const r = await runCheck(check, ctx);
      results.push(r);
      addLog("assessor", r.state === "Fail" ? "warn" : r.state === "Error" ? "error" : "info", `${check.id} ${r.state.toUpperCase()} — ${r.message}`);
    }
    const counts = countStates(results.map((r) => r.state));
    setResults({ results, coManaged: await isCoManaged(ctx) });
    updateAgent("assessor", { status: "done", task: "Assessment complete", progress: 1, output: `${counts.score}% · ${counts.Fail} failed` });
    handOff("assessor", "advisor", `${results.filter((r) => NEEDS_ADVICE.has(r.state)).length} findings`);

    // ── Advisor ────────────────────────────────────────────────────────────────
    current = "advisor";
    updateAgent("advisor", { status: "working", task: useAi ? `Asking ${model.label}` : "Using built-in advice", progress: 0 });
    addLog("advisor", "ai", useAi
      ? `Model: ${model.label}${model.leavesDevice ? ` — results are sent to ${model.recipient}${mask ? " (names masked)" : ""}` : " — runs locally, nothing leaves this device"}`
      : "No AI model configured — using the checks' built-in guidance.");
    const advice = await advise(results, {
      useAi,
      mask,
      batchSize: model.engine === "ollama" ? 4 : 25,
      signal,
      onBatch: (done, total) => updateAgent("advisor", { progress: total ? done / total : 1, task: `Advising ${Math.min(done + 1, total)}/${total}` }),
      onWarning: (text) => addLog("advisor", "warn", text),
    });
    setResults({ advice });
    const top = advice.filter((a) => a.priority <= 2).length;
    updateAgent("advisor", { status: "done", task: "Advice ready", progress: 1, output: `${advice.length} actions · ${top} urgent` });
    handOff("advisor", "reporter", `${advice.length} actions`);

    // ── Reporter ───────────────────────────────────────────────────────────────
    current = "reporter";
    updateAgent("reporter", { status: "working", task: "Scoring areas", progress: 0.2 });
    addLog("reporter", "info", "Scoring CIS areas and NIS2 art. 21 measures.");
    const tenantName = await getTenantName().catch(() => "");
    updateAgent("reporter", { task: useAi ? "Writing executive summary" : "Composing summary", progress: 0.5 });
    const report = await buildReport(results, advice, manualAnswers, tenantName, {
      deviceScope: windowsCount ? await describeWindowsScope(ctx) : undefined,
      useAi,
      mask,
      signal,
      onWarning: (text) => addLog("reporter", "warn", text),
    });
    setResults({ report });
    updateAgent("reporter", { status: "done", task: "Report ready", progress: 1, output: `${report.overall.score}% overall` });
    addLog("reporter", "info", "Benchmark complete.");
    useAgentRunStore.getState().finish();
  } catch (err) {
    const cancelled = (err as Error).name === "AbortError";
    const msg = cancelled ? "Cancelled by user" : (err as Error).message;
    updateAgent(current, { status: "error", task: msg });
    addLog(current, cancelled ? "warn" : "error", msg);
    useAgentRunStore.getState().finish(cancelled ? undefined : msg);
  } finally {
    controller = null;
  }
}
