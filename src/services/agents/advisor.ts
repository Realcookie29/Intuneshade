// ─── Advisor agent ────────────────────────────────────────────────────────────
// Turns results that need attention into prioritised advice. Uses the configured
// AI model when there is one; otherwise (or when the model fails) falls back to
// the check's own rule and expected value, so the benchmark always completes.
//
// The AI only ever sees results — never raw Graph responses — and its output is
// validated and treated as display-only text. Scripts are never executed.

import { checkById } from "../../baseline";
import type { Advice, CheckResult, Severity } from "../../baseline/types";
import { runAgentPrompt } from "../ai/provider";
import { maskFacts } from "../ai/mask";

const SEVERITY_PRIORITY: Record<Severity, Advice["priority"]> = { High: 1, Medium: 3, Low: 4 };

export const NEEDS_ADVICE = new Set(["Fail", "Partial", "Manual", "Error"]);

export function staticAdvice(r: CheckResult): Advice {
  const c = checkById(r.id);
  const steps = [`Target: ${r.expected}.`];
  if (c?.notes) steps.push(c.notes);
  return {
    id: r.id,
    explanation: r.message,
    priority: c ? (r.state === "Partial" ? Math.min(5, SEVERITY_PRIORITY[c.severity] + 1) : SEVERITY_PRIORITY[c.severity]) as Advice["priority"] : 3,
    effort: "medium",
    steps,
    source: "static",
  };
}

function buildPayload(results: CheckResult[], mask: boolean) {
  return {
    findings: results.map((r) => {
      const c = checkById(r.id);
      const facts = r.evidence.map((e) => `${e.path}: ${JSON.stringify(e.value)}`);
      return {
        controlId: r.id,
        title: c?.title,
        area: c?.area,
        severity: c?.severity,
        status: r.state,
        expected: r.expected,
        actual: r.actual,
        summary: mask ? maskFacts([r.message])[0] : r.message,
        facts: mask ? maskFacts(facts) : facts,
      };
    }),
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Validates one AI advice item; returns null when it is unusable. */
function sanitize(raw: unknown, allowedIds: Set<string>): Advice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.controlId, 32);
  if (!allowedIds.has(id)) return null;
  const explanation = str(r.explanation, 1200);
  if (!explanation) return null;
  const p = Number(r.priority);
  const priority = (p >= 1 && p <= 5 ? Math.round(p) : 3) as Advice["priority"];
  const effort = r.effort === "low" || r.effort === "high" ? r.effort : "medium";
  const steps = Array.isArray(r.steps) ? r.steps.map((s) => str(s, 600)).filter(Boolean).slice(0, 10) : [];
  const script = str(r.script, 6000) || undefined;
  return { id, explanation, priority, effort, steps, script, source: "ai" };
}

export interface AdvisorHooks {
  useAi: boolean;
  mask: boolean;
  /** Smaller batches for local models, which handle long prompts less well. */
  batchSize: number;
  onBatch: (done: number, total: number) => void;
  onWarning: (text: string) => void;
  signal?: AbortSignal;
}

export async function advise(results: CheckResult[], hooks: AdvisorHooks): Promise<Advice[]> {
  // Errors are about access, not configuration — static advice covers them.
  const todo = results.filter((r) => NEEDS_ADVICE.has(r.state));
  const aiTodo = todo.filter((r) => r.state === "Fail" || r.state === "Partial");
  if (!hooks.useAi) return todo.map(staticAdvice).sort((a, b) => a.priority - b.priority);

  const ai = new Map<string, Advice>();
  for (let i = 0; i < aiTodo.length; i += hooks.batchSize) {
    if (hooks.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const batch = aiTodo.slice(i, i + hooks.batchSize);
    hooks.onBatch(i, aiTodo.length);
    try {
      const res = (await runAgentPrompt("advise", buildPayload(batch, hooks.mask), hooks.signal)) as { advice?: unknown[] };
      const ids = new Set(batch.map((r) => r.id));
      for (const item of res.advice ?? []) {
        const a = sanitize(item, ids);
        if (a) ai.set(a.id, a);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      hooks.onWarning(`AI advice failed for ${batch.length} check(s), using built-in advice: ${(err as Error).message}`);
    }
  }
  hooks.onBatch(aiTodo.length, aiTodo.length);
  return todo.map((r) => ai.get(r.id) ?? staticAdvice(r)).sort((a, b) => a.priority - b.priority);
}
