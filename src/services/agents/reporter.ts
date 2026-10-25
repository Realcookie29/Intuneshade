// ─── Reporter agent ───────────────────────────────────────────────────────────
// Scores are computed here, deterministically. The AI (when configured) only
// writes the executive summary and key risks. Also renders the HTML export.

import { BASELINE_VERSION, NIS2_MANUAL_CHECKS, NIS2_MEASURES, controlById, controlsForProfile, score } from "../../baseline";
import type { Advice, BenchmarkReport, Control, Finding, Nis2Measure, Profile } from "../../baseline/types";
import { runAgentPrompt } from "../ai/provider";
import { maskFacts } from "../ai/mask";

const CATEGORIES: Control["category"][] = ["identity", "access", "endpoint", "compliance"];

function byFilter(findings: Finding[], keep: (c: Control) => boolean): Finding[] {
  return findings.filter((f) => {
    const c = controlById(f.controlId);
    return c ? keep(c) : false;
  });
}

function staticSummary(r: Omit<BenchmarkReport, "executiveSummary" | "keyRisks" | "summarySource">, findings: Finding[]) {
  const critical = byFilter(findings, (c) => c.severity === "critical").filter((f) => f.status === "fail");
  const weakest = CATEGORIES
    .filter((k) => r.byCategory[k].passed + r.byCategory[k].failed > 0)
    .sort((a, b) => r.byCategory[a].score - r.byCategory[b].score)[0];
  const parts = [
    `The tenant scores ${r.overall.score}% on IntuneShade Baseline ${r.profile}: ${r.overall.passed} controls pass and ${r.overall.failed} fail.`,
    critical.length
      ? `${critical.length} critical control${critical.length === 1 ? "" : "s"} fail and should be fixed first.`
      : "No critical controls fail.",
    weakest ? `The weakest area is ${weakest} (${r.byCategory[weakest].score}%).` : "",
    r.overall.manual + r.overall.errors
      ? `${r.overall.manual + r.overall.errors} control(s) need manual verification or could not be read.`
      : "",
  ];
  return {
    executiveSummary: parts.filter(Boolean).join(" "),
    keyRisks: critical.map((f) => controlById(f.controlId)?.title ?? f.controlId).slice(0, 5),
  };
}

export interface ReporterHooks {
  useAi: boolean;
  mask: boolean;
  onWarning: (text: string) => void;
  signal?: AbortSignal;
}

export async function buildReport(
  findings: Finding[],
  advice: Advice[],
  profile: Profile,
  tenantName: string,
  hooks: ReporterHooks,
): Promise<BenchmarkReport> {
  const byCategory = Object.fromEntries(
    CATEGORIES.map((k) => [k, score(byFilter(findings, (c) => c.category === k))]),
  ) as BenchmarkReport["byCategory"];
  const byNis2 = Object.fromEntries(
    (Object.keys(NIS2_MEASURES) as Nis2Measure[]).map((m) => [m, score(byFilter(findings, (c) => c.refs.nis2.includes(m)))]),
  ) as BenchmarkReport["byNis2"];

  const base = {
    generatedAt: new Date().toISOString(),
    tenantName,
    profile,
    overall: score(findings),
    byCategory,
    byNis2,
  };
  const fallback = staticSummary(base, findings);

  if (hooks.useAi) {
    try {
      const failed = findings.filter((f) => f.status === "fail").map((f) => ({
        controlId: f.controlId,
        title: controlById(f.controlId)?.title,
        severity: controlById(f.controlId)?.severity,
        summary: f.summary,
        facts: hooks.mask ? maskFacts(f.evidence.facts) : f.evidence.facts,
      }));
      const res = (await runAgentPrompt("report", {
        profile,
        overall: base.overall,
        byCategory,
        nis2: Object.fromEntries(Object.entries(byNis2).map(([m, s]) => [`${m}: ${NIS2_MEASURES[m as Nis2Measure]}`, s.score])),
        failed,
        topAdvice: advice.slice(0, 5).map((a) => ({ controlId: a.controlId, priority: a.priority })),
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

// ─── HTML export ──────────────────────────────────────────────────────────────
// Self-contained, script-free document (the production CSP would block inline
// scripts anyway). Every dynamic string is escaped — finding text and AI output
// are untrusted.

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

const STATUS_COLOR: Record<Finding["status"], string> = {
  pass: "#1f9d55", fail: "#d64545", manual: "#c98a00", not_applicable: "#888", error: "#888",
};

export function renderReportHtml(report: BenchmarkReport, findings: Finding[], advice: Advice[]): string {
  const adviceById = new Map(advice.map((a) => [a.controlId, a]));
  const inScope = new Set(controlsForProfile(report.profile).map((c) => c.id));
  const rows = findings.filter((f) => inScope.has(f.controlId)).map((f) => {
    const c = controlById(f.controlId)!;
    const a = adviceById.get(f.controlId);
    return `<tr>
      <td class="mono">${esc(c.id)}</td>
      <td><strong>${esc(c.title)}</strong><div class="muted">${esc(f.summary)}</div>
        ${a ? `<details><summary>Advice (priority ${a.priority}, effort ${esc(a.effort)})</summary><p>${esc(a.explanation)}</p><ol>${a.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>${a.script ? `<pre>${esc(a.script)}</pre>` : ""}</details>` : ""}
      </td>
      <td>${esc(c.profile)}</td>
      <td>${esc(c.severity)}</td>
      <td class="mono small">${esc(c.refs.cis.join(", ") || "—")}<br>${esc(c.refs.nis2.map((m) => `NIS2 21(2)(${m})`).join(", "))}</td>
      <td><span class="pill" style="background:${STATUS_COLOR[f.status]}">${esc(f.status.replace("_", " "))}</span></td>
    </tr>`;
  }).join("");

  const nis2Rows = (Object.keys(NIS2_MEASURES) as Nis2Measure[]).map((m) => {
    const s = report.byNis2[m];
    const tech = s.passed + s.failed ? `${s.score}% (${s.passed}/${s.passed + s.failed})` : "no technical controls";
    const manual = NIS2_MANUAL_CHECKS.filter((x) => x.measure === m).map((x) => `<li>☐ ${esc(x.text)}</li>`).join("");
    return `<tr><td class="mono">(${m})</td><td>${esc(NIS2_MEASURES[m])}${manual ? `<ul class="check">${manual}</ul>` : ""}</td><td>${esc(tech)}</td></tr>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IntuneShade Baseline report — ${esc(report.tenantName || "tenant")}</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;color:#1b1d24;max-width:1100px;margin:32px auto;padding:0 20px;line-height:1.45}
h1{margin:0 0 4px}h2{margin-top:36px;border-bottom:2px solid #FFB020;padding-bottom:4px}
.muted{color:#666;font-size:13px}.mono{font-family:Consolas,monospace}.small{font-size:12px}
.kpis{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0}.kpi{border:1px solid #ddd;border-radius:8px;padding:12px 16px;min-width:130px}
.kpi b{display:block;font-size:28px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid #eee;padding:8px;text-align:left;vertical-align:top}
.pill{color:#fff;border-radius:10px;padding:2px 8px;font-size:12px;white-space:nowrap}
pre{background:#f5f5f7;padding:10px;overflow:auto;font-size:12px}ul.check{list-style:none;padding-left:0;font-size:13px;color:#444}
.disclaimer{background:#fff8e6;border-left:3px solid #FFB020;padding:10px 14px;font-size:13px}
@media print{details{display:block}details>summary{display:none}}
</style></head><body>
<h1>IntuneShade Baseline ${esc(report.profile)} — ${esc(report.tenantName || "tenant")}</h1>
<div class="muted">Generated ${esc(new Date(report.generatedAt).toLocaleString())} · baseline v${BASELINE_VERSION} · summary: ${report.summarySource === "ai" ? "AI-generated" : "rule-based"}</div>
<div class="kpis">
<div class="kpi"><b>${report.overall.score}%</b>overall score</div>
<div class="kpi"><b>${report.overall.passed}</b>passed</div>
<div class="kpi"><b>${report.overall.failed}</b>failed</div>
<div class="kpi"><b>${report.overall.manual + report.overall.errors}</b>manual / not readable</div>
</div>
<h2>Executive summary</h2><p>${esc(report.executiveSummary)}</p>
${report.keyRisks.length ? `<ul>${report.keyRisks.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
<h2>Controls</h2>
<table><thead><tr><th>ID</th><th>Control</th><th>Profile</th><th>Severity</th><th>References</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
<h2>NIS2 / Cyberbeveiligingswet — technical readiness per art. 21(2) measure</h2>
<table><thead><tr><th></th><th>Measure</th><th>Technical controls</th></tr></thead><tbody>${nis2Rows}</tbody></table>
<h2>About this report</h2>
<p class="disclaimer">This is an automated technical readiness check of a Microsoft 365 tenant against the IntuneShade Baseline. It is not an audit and not a compliance statement. CIS references are indicative and point to the CIS Benchmarks® published by the Center for Internet Security; verify them against the benchmark version you are licensed for. NIS2 also requires organisational measures that a tenant scan cannot verify (see the checklist above).</p>
</body></html>`;
}
