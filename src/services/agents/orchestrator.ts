// ─── Agent orchestrator ───────────────────────────────────────────────────────
// Runs the four agents as a pipeline — Collector → Assessor → Advisor → Reporter —
// and narrates every step into agentRunStore for the "Place for your agents" page.

import { assessControl, controlsForProfile, score } from "../../baseline";
import type { Finding, Profile } from "../../baseline/types";
import { useAgentRunStore, type AgentId } from "../../store/agentRunStore";
import { useAgentModelStore } from "../../store/agentModelStore";
import { ensureScopes, getTenantName } from "../graphClient";
import { BASELINE_SCOPES } from "../../auth/msalConfig";
import { currentModel } from "../ai/provider";
import { collectSnapshot, sourceSize } from "./collector";
import { advise } from "./advisor";
import { buildReport } from "./reporter";

let controller: AbortController | null = null;

/** Lets the UI breathe between fast, synchronous steps so progress is visible. */
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function cancelBenchmark() {
  controller?.abort();
}

export async function runBenchmark(profile: Profile): Promise<void> {
  const store = useAgentRunStore.getState();
  if (store.running) return;
  store.reset();
  store.start();
  controller = new AbortController();
  const signal = controller.signal;

  const { updateAgent, addLog, handOff, setResults } = useAgentRunStore.getState();
  const model = currentModel();
  const { maskNames } = useAgentModelStore.getState();
  const useAi = model.engine !== "static";
  const mask = model.leavesDevice && maskNames;
  let current: AgentId = "collector";

  try {
    // ── Collector ──────────────────────────────────────────────────────────────
    updateAgent("collector", { status: "working", task: "Requesting read access", progress: 0 });
    addLog("collector", "info", "Checking read permissions…");
    if ((await ensureScopes(BASELINE_SCOPES, "agents")) === "redirecting") {
      addLog("collector", "info", "Redirecting to Microsoft to consent to read-only permissions…");
      useAgentRunStore.getState().finish();
      return;
    }
    addLog("collector", "info", "Starting read-only collection. No changes are made to the tenant.");
    const snapshot = await collectSnapshot({
      signal,
      onSource: (i, total, label, endpoint) => {
        updateAgent("collector", { task: `Reading ${label}`, progress: i / total });
        addLog("collector", "graph", `GET ${endpoint}`);
      },
      onSourceDone: (label, result) => {
        if (result.ok) {
          const n = sourceSize(result);
          addLog("collector", "info", `${label}: ${n === null ? "read" : `${n} item${n === 1 ? "" : "s"}`}`);
        } else {
          addLog("collector", "warn", `${label}: ${result.error}`);
        }
      },
    });
    const okCount = Object.values(snapshot).filter((v) => typeof v === "object" && v.ok).length;
    setResults({ snapshot });
    updateAgent("collector", { status: "done", task: "Snapshot complete", progress: 1, output: `${okCount} sources read` });
    handOff("collector", "assessor", `${okCount} sources`);

    // ── Assessor ───────────────────────────────────────────────────────────────
    current = "assessor";
    const controls = controlsForProfile(profile);
    updateAgent("assessor", { status: "working", task: "Loading IntuneShade Baseline", progress: 0 });
    addLog("assessor", "info", `Checking ${controls.length} controls (profile ${profile}) — deterministic rules, no AI.`);
    const findings: Finding[] = [];
    for (const [i, control] of controls.entries()) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      updateAgent("assessor", { task: `${control.id} · ${control.title}`, progress: i / controls.length });
      const f = assessControl(control, snapshot);
      findings.push(f);
      addLog("assessor", f.status === "fail" ? "warn" : f.status === "error" ? "error" : "info",
        `${control.id} ${f.status.toUpperCase()} — ${f.summary}`);
      await tick(60);
    }
    const s = score(findings);
    setResults({ findings });
    updateAgent("assessor", { status: "done", task: "Assessment complete", progress: 1, output: `${s.score}% · ${s.failed} failed` });
    const toAdvise = findings.filter((f) => f.status === "fail" || f.status === "manual").length;
    handOff("assessor", "advisor", `${toAdvise} findings`);

    // ── Advisor ────────────────────────────────────────────────────────────────
    current = "advisor";
    updateAgent("advisor", { status: "working", task: useAi ? `Asking ${model.label}` : "Using built-in advice", progress: 0 });
    addLog("advisor", "ai", useAi
      ? `Model: ${model.label}${model.leavesDevice ? ` — findings are sent to ${model.recipient}${mask ? " (names masked)" : ""}` : " — runs locally, nothing leaves this device"}`
      : "No AI model configured — using the baseline's built-in remediation.");
    const advice = await advise(findings, {
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
    updateAgent("reporter", { status: "working", task: "Scoring frameworks", progress: 0.2 });
    addLog("reporter", "info", "Scoring CIS profile, categories and NIS2 art. 21 measures.");
    const tenantName = await getTenantName().catch(() => "");
    updateAgent("reporter", { task: useAi ? "Writing executive summary" : "Composing summary", progress: 0.5 });
    const report = await buildReport(findings, advice, profile, tenantName, {
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
