// ─── Reporter agent ───────────────────────────────────────────────────────────
// Scores are computed here, deterministically. The AI (when configured) only
// writes the executive summary and key risks. Also renders the HTML export.

import {
  BASELINE_NAME, BASELINE_SOURCE, CHECKS, NIS2_MANUAL_CHECKS, NIS2_MEASURES,
  checkById, countStates, effectiveState, nis2For,
} from "../../baseline";
import type { Advice, BenchmarkReport, CheckResult, CheckState, Coverage, ManualAnswer, Nis2Measure, StateCounts } from "../../baseline/types";
import { runAgentPrompt } from "../ai/provider";
import { maskFacts } from "../ai/mask";
import { toCsv } from "../../utils/csv";
import { REPORT_CSP_META } from "../../utils/reportInteractivity";

export { toCsv };

/** Areas in the order they appear in the baseline. */
export const AREAS: string[] = [...new Set(CHECKS.map((c) => c.area))];

type Scores = Pick<BenchmarkReport, "overall" | "byArea" | "byNis2">;

export function coverageOf(results: CheckResult[]): Coverage {
  const assessedAreas = new Set(results.map((r) => checkById(r.id)?.area));
  return {
    assessed: results.length,
    total: CHECKS.length,
    areasNotAssessed: AREAS.filter((a) => !assessedAreas.has(a)),
  };
}

/** "18 of 52 CIS L1 tenant checks" — or "all 52" for a full run. */
export function coverageLabel(c: Coverage): string {
  return c.assessed >= c.total ? `all ${c.total} CIS L1 tenant checks` : `${c.assessed} of ${c.total} CIS L1 tenant checks`;
}

/** Scores over effective states (manual answers included). Pure — the UI recomputes it live. */
export function scoreResults(results: CheckResult[], answers: Record<string, ManualAnswer>): Scores {
  const states = results.map((r) => ({ r, s: effectiveState(r, answers), c: checkById(r.id) }));
  const pick = (keep: (x: (typeof states)[number]) => boolean): StateCounts => countStates(states.filter(keep).map((x) => x.s));
  return {
    overall: pick(() => true),
    byArea: Object.fromEntries(AREAS.map((a) => [a, pick((x) => x.c?.area === a)])),
    byNis2: Object.fromEntries(
      (Object.keys(NIS2_MEASURES) as Nis2Measure[]).map((m) => [m, pick((x) => !!x.c && nis2For(x.c).includes(m))]),
    ) as Record<Nis2Measure, StateCounts>,
  };
}

function staticSummary(s: Scores, results: CheckResult[], answers: Record<string, ManualAnswer>, coverage: Coverage) {
  const failing = results.filter((r) => effectiveState(r, answers) === "Fail");
  const highFail = failing.filter((r) => checkById(r.id)?.severity === "High");
  const weakest = AREAS
    .filter((a) => s.byArea[a].Pass + s.byArea[a].Fail + s.byArea[a].Partial > 0)
    .sort((a, b) => s.byArea[a].score - s.byArea[b].score)[0];
  const o = s.overall;
  const parts = [
    `The tenant scores ${o.score}% on ${coverageLabel(coverage)}: ${o.Pass} pass, ${o.Partial} partially pass and ${o.Fail} fail.`,
    coverage.areasNotAssessed.length ? `Not assessed in this run: ${coverage.areasNotAssessed.join(", ")}.` : "",
    highFail.length
      ? `${highFail.length} high-severity check${highFail.length === 1 ? "" : "s"} fail and should be fixed first.`
      : "No high-severity checks fail.",
    weakest ? `The weakest area is ${weakest} (${s.byArea[weakest].score}%).` : "",
    o.Manual + o.Error
      ? `${o.Manual + o.Error} check(s) need manual verification or could not be read.`
      : "",
  ];
  return {
    executiveSummary: parts.filter(Boolean).join(" "),
    keyRisks: highFail.map((r) => `${r.id} ${checkById(r.id)?.title ?? ""}`.trim()).slice(0, 5),
  };
}

export interface ReporterHooks {
  useAi: boolean;
  mask: boolean;
  onWarning: (text: string) => void;
  signal?: AbortSignal;
}

export async function buildReport(
  results: CheckResult[],
  advice: Advice[],
  answers: Record<string, ManualAnswer>,
  tenantName: string,
  hooks: ReporterHooks,
): Promise<BenchmarkReport> {
  const scores = scoreResults(results, answers);
  const coverage = coverageOf(results);
  const base = { generatedAt: new Date().toISOString(), tenantName, ...scores, coverage };
  const fallback = staticSummary(scores, results, answers, coverage);

  if (hooks.useAi) {
    try {
      const failed = results
        .filter((r) => { const s = effectiveState(r, answers); return s === "Fail" || s === "Partial"; })
        .map((r) => ({
          controlId: r.id,
          title: checkById(r.id)?.title,
          severity: checkById(r.id)?.severity,
          status: r.state,
          summary: hooks.mask ? maskFacts([r.message])[0] : r.message,
        }));
      const res = (await runAgentPrompt("report", {
        benchmark: "CIS Microsoft 365 L1 — tenant checks",
        coverage,
        overall: scores.overall,
        byArea: Object.fromEntries(Object.entries(scores.byArea).map(([a, s]) => [a, s.score])),
        nis2: Object.fromEntries(Object.entries(scores.byNis2).map(([m, s]) => [`${m}: ${NIS2_MEASURES[m as Nis2Measure]}`, s.score])),
        failed,
        topAdvice: advice.slice(0, 5).map((a) => ({ controlId: a.id, priority: a.priority })),
      }, hooks.signal)) as { executiveSummary?: unknown; keyRisks?: unknown };
      const summary = typeof res.executiveSummary === "string" ? res.executiveSummary.slice(0, 2000) : "";
      if (summary) {
        const keyRisks = Array.isArray(res.keyRisks)
          ? res.keyRisks.filter((r): r is string => typeof r === "string").map((r) => r.slice(0, 300)).slice(0, 5)
          : fallback.keyRisks;
        return { ...base, executiveSummary: summary, keyRisks, summarySource: "ai" };
      }
      hooks.onWarning("AI returned no summary, using the built-in summary.");
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      hooks.onWarning(`AI summary failed, using the built-in summary: ${(err as Error).message}`);
    }
  }
  return { ...base, ...fallback, summarySource: "static" };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export const STATE_COLOR: Record<CheckState, string> = {
  Pass: "#1f9d55", Fail: "#d64545", Partial: "#e07b00", Manual: "#c98a00", NotApplicable: "#888", Error: "#7a5af8",
};

export const STATE_LABEL: Record<CheckState, string> = {
  Pass: "Pass", Fail: "Fail", Partial: "Partial", Manual: "Manual", NotApplicable: "N/A", Error: "Error",
};

export function resultsCsv(results: CheckResult[], answers: Record<string, ManualAnswer>): string {
  return toCsv(
    ["CIS ID", "Title", "Area", "Severity", "State", "Answered manually", "Expected", "Actual", "Message", "Notes"],
    results.map((r) => {
      const c = checkById(r.id);
      const a = answers[r.id];
      return [r.id, c?.title, c?.area, c?.severity, effectiveState(r, answers), r.state === "Manual" && a ? "yes" : "",
        r.expected, r.actual, r.message, a?.notes ?? ""];
    }),
  );
}

export function resultsJson(report: BenchmarkReport | null, results: CheckResult[], advice: Advice[], answers: Record<string, ManualAnswer>): string {
  return JSON.stringify({ baseline: BASELINE_NAME, source: BASELINE_SOURCE, report, results, advice, manualAnswers: answers }, null, 2);
}

/**
 * Self-contained, script-free HTML document (the production CSP would block
 * inline scripts anyway). Every dynamic string is escaped — tenant data and AI
 * output are untrusted.
 */
export function renderReportHtml(report: BenchmarkReport, results: CheckResult[], advice: Advice[], answers: Record<string, ManualAnswer>): string {
  const adviceById = new Map(advice.map((a) => [a.id, a]));
  const rows = results.map((r) => {
    const c = checkById(r.id);
    const a = adviceById.get(r.id);
    const s = effectiveState(r, answers);
    const ans = r.state === "Manual" ? answers[r.id] : undefined;
    return `<tr>
      <td class="mono">${esc(r.id)}</td>
      <td><strong>${esc(c?.title ?? r.id)}</strong><div class="muted">${esc(r.message)}</div>
        <div class="small">Expected: ${esc(r.expected)} · Actual: ${esc(r.actual)}</div>
        ${ans ? `<div class="small">Answered manually${ans.notes ? `: ${esc(ans.notes)}` : ""}</div>` : ""}
        ${a ? `<details><summary>Advice (priority ${a.priority}, effort ${esc(a.effort)})</summary><p>${esc(a.explanation)}</p><ol>${a.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>${a.script ? `<pre>${esc(a.script)}</pre>` : ""}</details>` : ""}
      </td>
      <td>${esc(c?.area)}</td>
      <td>${esc(c?.severity)}</td>
      <td><span class="pill" style="background:${STATE_COLOR[s]}">${esc(STATE_LABEL[s])}</span></td>
    </tr>`;
  }).join("");

  const notAssessed = new Set(report.coverage.areasNotAssessed);
  const areaRows = AREAS.map((a) => {
    const s = report.byArea[a];
    if (notAssessed.has(a)) return `<tr><td>${esc(a)}</td><td colspan="5" class="muted">not assessed in this run</td></tr>`;
    return `<tr><td>${esc(a)}</td><td>${s.Pass + s.Fail + s.Partial ? `${s.score}%` : "—"}</td><td>${s.Pass}</td><td>${s.Partial}</td><td>${s.Fail}</td><td>${s.Manual + s.Error}</td></tr>`;
  }).join("");

  const nis2Rows = (Object.keys(NIS2_MEASURES) as Nis2Measure[]).map((m) => {
    const s = report.byNis2[m];
    const scored = s.Pass + s.Fail + s.Partial;
    const tech = scored ? `${s.score}% (${s.Pass}/${scored})` : "no technical checks";
    const manual = NIS2_MANUAL_CHECKS.filter((x) => x.measure === m).map((x) => `<li>☐ ${esc(x.text)}</li>`).join("");
    return `<tr><td class="mono">(${m})</td><td>${esc(NIS2_MEASURES[m])}${manual ? `<ul class="check">${manual}</ul>` : ""}</td><td>${esc(tech)}</td></tr>`;
  }).join("");

  const o = report.overall;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${REPORT_CSP_META}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IntuneShade baseline report — ${esc(report.tenantName || "tenant")}</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;color:#1b1d24;max-width:1100px;margin:32px auto;padding:0 20px;line-height:1.45}
h1{margin:0 0 4px}h2{margin-top:36px;border-bottom:2px solid #FFB020;padding-bottom:4px}
.muted{color:#666;font-size:13px}.mono{font-family:Consolas,monospace}.small{font-size:12px;color:#555}
.kpis{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0}.kpi{border:1px solid #ddd;border-radius:8px;padding:12px 16px;min-width:110px}
.kpi b{display:block;font-size:28px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid #eee;padding:8px;text-align:left;vertical-align:top}
.pill{color:#fff;border-radius:10px;padding:2px 8px;font-size:12px;white-space:nowrap}
pre{background:#f5f5f7;padding:10px;overflow:auto;font-size:12px;white-space:pre-wrap}ul.check{list-style:none;padding-left:0;font-size:13px;color:#444}
.disclaimer{background:#fff8e6;border-left:3px solid #FFB020;padding:10px 14px;font-size:13px}
@media print{details{display:block}details>summary{display:none}}
</style></head><body>
<h1>IntuneShade baseline — ${esc(report.tenantName || "tenant")}</h1>
<div class="muted">Scope: ${esc(coverageLabel(report.coverage))} · generated ${esc(new Date(report.generatedAt).toLocaleString())} · summary: ${report.summarySource === "ai" ? "AI-generated" : "rule-based"}</div>
<div class="kpis">
<div class="kpi"><b>${o.score}%</b>score on ${report.coverage.assessed}/${report.coverage.total} checks</div>
<div class="kpi"><b>${o.Pass}</b>pass</div>
<div class="kpi"><b>${o.Partial}</b>partial</div>
<div class="kpi"><b>${o.Fail}</b>fail</div>
<div class="kpi"><b>${o.Manual}</b>manual</div>
<div class="kpi"><b>${o.NotApplicable}</b>not applicable</div>
<div class="kpi"><b>${o.Error}</b>not readable</div>
</div>
<p class="small">Score = Pass / (Pass + Partial + Fail) over the checks assessed in this run. Manual, not applicable and unreadable checks are not scored.${report.coverage.assessed < report.coverage.total ? ` <strong>Partial scan:</strong> ${report.coverage.total - report.coverage.assessed} checks were not selected${report.coverage.areasNotAssessed.length ? ` (areas not assessed: ${esc(report.coverage.areasNotAssessed.join(", "))})` : ""}, so this score does not cover the whole benchmark.` : ""}</p>
<h2>Executive summary</h2><p>${esc(report.executiveSummary)}</p>
${report.keyRisks.length ? `<ul>${report.keyRisks.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
<h2>By area</h2>
<table><thead><tr><th>Area</th><th>Score</th><th>Pass</th><th>Partial</th><th>Fail</th><th>Manual / error</th></tr></thead><tbody>${areaRows}</tbody></table>
<h2>Checks</h2>
<table><thead><tr><th>CIS ID</th><th>Check</th><th>Area</th><th>Severity</th><th>State</th></tr></thead><tbody>${rows}</tbody></table>
<h2>NIS2 / Cyberbeveiligingswet — technical readiness per art. 21(2) measure</h2>
<table><thead><tr><th></th><th>Measure</th><th>Technical checks</th></tr></thead><tbody>${nis2Rows}</tbody></table>
<h2>About this report</h2>
<p class="disclaimer">This is an automated, read-only technical check of a Microsoft 365 tenant. It is not an audit and not a compliance statement. Check IDs refer to the CIS Microsoft 365 Foundations Benchmark® published by the Center for Internet Security (scope: ${esc(BASELINE_SOURCE)}); the descriptions are IntuneShade's own. Verify results against the benchmark version you are licensed for. NIS2 also requires organisational measures that a tenant scan cannot verify (see the checklist above).</p>
</body></html>`;
}
