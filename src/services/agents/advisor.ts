// ─── Advisor agent ────────────────────────────────────────────────────────────
// Turns failed / manual findings into prioritised advice. Uses the configured AI
// model when there is one; otherwise (or when the model fails) falls back to the
// static remediation text in the control set, so the benchmark always completes.
//
// The AI only ever sees findings — never the raw tenant snapshot — and its output
// is validated and treated as display-only text. Scripts are never executed.

import { controlById } from "../../baseline";
import type { Advice, Control, Finding } from "../../baseline/types";
import { runAgentPrompt } from "../ai/provider";
import { maskFacts } from "../ai/mask";

const SEVERITY_PRIORITY: Record<Control["severity"], Advice["priority"]> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export function staticAdvice(finding: Finding): Advice {
  const control = controlById(finding.controlId);
  return {
    controlId: finding.controlId,
    explanation: control?.rationale ?? finding.summary,
    priority: control ? SEVERITY_PRIORITY[control.severity] : 3,
    effort: "medium",
    steps: control ? [control.remediation] : [],
    source: "static",
  };
}

function buildPayload(findings: Finding[], mask: boolean) {
  return {
    findings: findings.map((f) => {
      const c = controlById(f.controlId);
      return {
        controlId: f.controlId,
        title: c?.title,
        severity: c?.severity,
        status: f.status,
        summary: f.summary,
        facts: mask ? maskFacts(f.evidence.facts) : f.evidence.facts,
      };
    }),
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Validates one AI advice item; returns null when it is unusable. */
function sanitize(raw: unknown, allowedIds: Set<string>): Advice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const controlId = str(r.controlId, 32);
  if (!allowedIds.has(controlId)) return null;
  const explanation = str(r.explanation, 1200);
  if (!explanation) return null;
  const p = Number(r.priority);
  const priority = (p >= 1 && p <= 5 ? Math.round(p) : 3) as Advice["priority"];
  const effort = r.effort === "low" || r.effort === "high" ? r.effort : "medium";
  const steps = Array.isArray(r.steps) ? r.steps.map((s) => str(s, 600)).filter(Boolean).slice(0, 10) : [];
  const script = str(r.script, 6000) || undefined;
  return { controlId, explanation, priority, effort, steps, script, source: "ai" };
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

export async function advise(findings: Finding[], hooks: AdvisorHooks): Promise<Advice[]> {
  const todo = findings.filter((f) => f.status === "fail" || f.status === "manual");
  if (!hooks.useAi) return todo.map(staticAdvice);

  const result = new Map<string, Advice>();
  for (let i = 0; i < todo.length; i += hooks.batchSize) {
    if (hooks.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const batch = todo.slice(i, i + hooks.batchSize);
    hooks.onBatch(i, todo.length);
    try {
      const res = (await runAgentPrompt("advise", buildPayload(batch, hooks.mask), hooks.signal)) as { advice?: unknown[] };
      const ids = new Set(batch.map((f) => f.controlId));
      for (const item of res.advice ?? []) {
        const a = sanitize(item, ids);
        if (a) result.set(a.controlId, a);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      hooks.onWarning(`AI advice failed for ${batch.length} finding(s), using built-in advice: ${(err as Error).message}`);
    }
  }
  hooks.onBatch(todo.length, todo.length);
  return todo
    .map((f) => result.get(f.controlId) ?? staticAdvice(f))
    .sort((a, b) => a.priority - b.priority);
}
