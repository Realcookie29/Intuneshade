import type { AssignmentRecord } from "./assignmentScanService";
import { POLICY_DEFINITIONS } from "../utils/policyConfig";
import type { PolicyType } from "../types/policyTypes";

export type ReportGrouping = "group" | "policyType" | "policy";

export interface ReportOptions {
  grouping: ReportGrouping;
  includeVirtual: boolean; // include "All Users" / "All Devices" targets
  includeExclusions: boolean;
  includeFilters: boolean;
}

export interface ReportMeta {
  tenantName: string;
  generatedBy: string;
  generatedAt: string; // preformatted date string (Date.* is avoided in shared code paths)
}

const TYPE_LABEL = new Map<PolicyType, string>(
  POLICY_DEFINITIONS.map((d) => [d.type, d.label]),
);

const TYPE_COLORS: Record<PolicyType, string> = {
  mobileApps: "#6E62E5",
  configurationPolicies: "#3DDC97",
  deviceConfigurations: "#FFB020",
  deviceCompliancePolicies: "#FF5C6C",
  groupPolicyConfigurations: "#4FC3F7",
  deviceManagementScripts: "#B39DDB",
  deviceHealthScripts: "#F06292",
  windowsAutopilotDeploymentProfiles: "#FFD54F",
  mobileAppConfigurations: "#4DB6AC",
  deviceManagementIntents: "#A1887F",
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Filter the raw scan down to the records the report should include. */
function selectRecords(records: AssignmentRecord[], opts: ReportOptions): AssignmentRecord[] {
  return records.filter((r) => {
    if (!opts.includeVirtual && r.targetKind !== "group") return false;
    if (!opts.includeExclusions && r.mode === "exclude") return false;
    return true;
  });
}

interface Summary {
  policies: number;
  groups: number;
  assignments: number;
  exclusions: number;
  broad: number;
  byType: { type: PolicyType; label: string; count: number }[];
}

function summarize(records: AssignmentRecord[]): Summary {
  const policyIds = new Set<string>();
  const groupKeys = new Set<string>();
  const byType = new Map<PolicyType, Set<string>>();
  let exclusions = 0;
  let broad = 0;

  for (const r of records) {
    policyIds.add(r.policyId);
    if (r.targetKind === "group" && r.groupId) groupKeys.add(r.groupId);
    if (r.targetKind !== "group") broad++;
    if (r.mode === "exclude") exclusions++;
    if (!byType.has(r.policyType)) byType.set(r.policyType, new Set());
    byType.get(r.policyType)!.add(r.policyId);
  }

  return {
    policies: policyIds.size,
    groups: groupKeys.size,
    assignments: records.length,
    exclusions,
    broad,
    byType: POLICY_DEFINITIONS
      .map((d) => ({ type: d.type, label: d.label, count: byType.get(d.type)?.size ?? 0 }))
      .filter((t) => t.count > 0),
  };
}

function targetLabel(r: AssignmentRecord): string {
  if (r.targetKind === "allUsers") return "All Users";
  if (r.targetKind === "allDevices") return "All Devices";
  return r.groupName || "(unknown group)";
}

function modeBadge(r: AssignmentRecord): string {
  if (r.mode === "exclude") return `<span class="badge exclude">Exclude</span>`;
  if (r.targetKind !== "group") return `<span class="badge virtual">${esc(targetLabel(r))}</span>`;
  return `<span class="badge include">Include</span>`;
}

/** Build the collapsible sections that make up the body of the report. */
function buildSections(records: AssignmentRecord[], opts: ReportOptions): string {
  if (opts.grouping === "policyType") {
    const groups = new Map<PolicyType, AssignmentRecord[]>();
    for (const r of records) {
      if (!groups.has(r.policyType)) groups.set(r.policyType, []);
      groups.get(r.policyType)!.push(r);
    }
    const ordered = POLICY_DEFINITIONS.filter((d) => groups.has(d.type));
    return ordered.map((d) => {
      const rows = groups.get(d.type)!.sort((a, b) => a.policyName.localeCompare(b.policyName));
      const policyCount = new Set(rows.map((r) => r.policyId)).size;
      return section(
        TYPE_LABEL.get(d.type) ?? d.type,
        `${policyCount} policies · ${rows.length} assignments`,
        TYPE_COLORS[d.type],
        table(["Policy", "Target", "Mode", ...(opts.includeFilters ? ["Filter"] : []), "Intent"],
          rows.map((r) => [
            esc(r.policyName),
            esc(targetLabel(r)),
            modeBadge(r),
            ...(opts.includeFilters ? [r.filterName ? esc(r.filterName) : "—"] : []),
            r.installIntent ? esc(r.installIntent) : "—",
          ]),
        ),
      );
    }).join("\n");
  }

  if (opts.grouping === "policy") {
    const groups = new Map<string, AssignmentRecord[]>();
    for (const r of records) {
      if (!groups.has(r.policyId)) groups.set(r.policyId, []);
      groups.get(r.policyId)!.push(r);
    }
    const ordered = [...groups.values()].sort((a, b) => a[0].policyName.localeCompare(b[0].policyName));
    return ordered.map((rows) => {
      const head = rows[0];
      return section(
        head.policyName,
        `${TYPE_LABEL.get(head.policyType) ?? head.policyType} · ${rows.length} targets`,
        TYPE_COLORS[head.policyType],
        table(["Target", "Mode", ...(opts.includeFilters ? ["Filter"] : []), "Intent"],
          rows
            .sort((a, b) => targetLabel(a).localeCompare(targetLabel(b)))
            .map((r) => [
              esc(targetLabel(r)),
              modeBadge(r),
              ...(opts.includeFilters ? [r.filterName ? esc(r.filterName) : "—"] : []),
              r.installIntent ? esc(r.installIntent) : "—",
            ]),
        ),
      );
    }).join("\n");
  }

  // Default: group by target (group / virtual)
  const groups = new Map<string, { label: string; rows: AssignmentRecord[] }>();
  for (const r of records) {
    const key = r.targetKind === "group" ? (r.groupId ?? "unknown") : r.targetKind;
    if (!groups.has(key)) groups.set(key, { label: targetLabel(r), rows: [] });
    groups.get(key)!.rows.push(r);
  }
  const ordered = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  return ordered.map(({ label, rows }) => {
    const policyCount = new Set(rows.map((r) => r.policyId)).size;
    return section(
      label,
      `${policyCount} policies · ${rows.length} assignments`,
      "#6E62E5",
      table(["Policy", "Type", "Mode", ...(opts.includeFilters ? ["Filter"] : []), "Intent"],
        rows
          .sort((a, b) => a.policyName.localeCompare(b.policyName))
          .map((r) => [
            esc(r.policyName),
            `<span class="type-dot" style="background:${TYPE_COLORS[r.policyType]}"></span>${esc(TYPE_LABEL.get(r.policyType) ?? r.policyType)}`,
            modeBadge(r),
            ...(opts.includeFilters ? [r.filterName ? esc(r.filterName) : "—"] : []),
            r.installIntent ? esc(r.installIntent) : "—",
          ]),
      ),
    );
  }).join("\n");
}

function section(title: string, meta: string, accent: string, body: string): string {
  return `<details class="section" open>
  <summary style="--accent:${accent}">
    <span class="sec-title">${esc(title)}</span>
    <span class="sec-meta">${esc(meta)}</span>
    <span class="sec-chev">▸</span>
  </summary>
  <div class="sec-body">${body}</div>
</details>`;
}

function table(headers: string[], rows: string[][]): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function statTile(value: number | string, label: string, accent?: string): string {
  return `<div class="tile"${accent ? ` style="--tile:${accent}"` : ""}>
    <div class="tile-val">${esc(String(value))}</div>
    <div class="tile-label">${esc(label)}</div>
  </div>`;
}

/** Produces a fully self-contained HTML document (inline CSS + JS, no externals). */
export function buildReportHtml(
  records: AssignmentRecord[],
  opts: ReportOptions,
  meta: ReportMeta,
): string {
  const selected = selectRecords(records, opts);
  const s = summarize(selected);
  const groupingLabel =
    opts.grouping === "policyType" ? "policy type" : opts.grouping === "policy" ? "policy" : "target group";

  const typeChips = s.byType
    .map((t) => `<span class="chip"><span class="type-dot" style="background:${TYPE_COLORS[t.type]}"></span>${esc(t.label)} <b>${t.count}</b></span>`)
    .join("");

  const sections = selected.length
    ? buildSections(selected, opts)
    : `<div class="empty">No assignments match the selected options.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Intune Assignment Report — ${esc(meta.tenantName)}</title>
<style>
  :root {
    --ink0:#0B0D13; --ink1:#0E1017; --ink2:#131620; --ink3:#191D28;
    --stroke:#242A38; --fg:#E8EAF0; --fg2:#A9B0C0; --fg3:#6B7386;
    --iris:#6E62E5; --amber:#FFB020; --mint:#3DDC97; --danger:#FF5C6C;
  }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; }
  body {
    background:var(--ink0); color:var(--fg);
    font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;
    font-size:14px; line-height:1.5; -webkit-font-smoothing:antialiased;
  }
  .wrap { max-width:1100px; margin:0 auto; padding:32px 24px 64px; }
  header.cover {
    background:linear-gradient(135deg,#1a1a2e 0%,#211d4a 55%,#2E2B63 100%);
    border:1px solid var(--stroke); border-radius:16px; padding:28px 32px;
    position:relative; overflow:hidden;
  }
  header.cover::after {
    content:""; position:absolute; right:-60px; top:-60px; width:220px; height:220px;
    background:radial-gradient(circle, rgba(110,98,229,.35), transparent 70%);
  }
  .eyebrow {
    font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11px;
    letter-spacing:.16em; text-transform:uppercase; color:var(--amber); font-weight:700;
  }
  h1 { font-size:30px; margin:6px 0 4px; letter-spacing:-.02em; font-weight:700;
       font-family:'Space Grotesk','Inter',sans-serif; }
  .cover-meta { color:var(--fg2); font-size:13px; display:flex; gap:18px; flex-wrap:wrap; margin-top:8px; }
  .cover-meta b { color:var(--fg); font-weight:600; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; margin:22px 0; }
  .tile {
    background:var(--ink2); border:1px solid var(--stroke); border-radius:12px;
    padding:16px 18px; position:relative; --tile:var(--iris);
  }
  .tile::before { content:""; position:absolute; left:0; top:14px; bottom:14px; width:3px;
                  border-radius:0 2px 2px 0; background:var(--tile); }
  .tile-val { font-size:26px; font-weight:700; font-family:'Space Grotesk','Inter',sans-serif; line-height:1; }
  .tile-label { color:var(--fg3); font-size:12px; margin-top:6px; text-transform:uppercase; letter-spacing:.05em; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin:4px 0 26px; }
  .chip {
    background:var(--ink2); border:1px solid var(--stroke); border-radius:999px;
    padding:5px 12px; font-size:12px; color:var(--fg2); display:inline-flex; align-items:center; gap:6px;
  }
  .chip b { color:var(--fg); }
  .type-dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
  .toolbar { display:flex; gap:8px; align-items:center; margin:0 0 16px; flex-wrap:wrap; }
  .toolbar input {
    background:var(--ink2); border:1px solid var(--stroke); border-radius:8px; color:var(--fg);
    padding:8px 12px; font-size:13px; min-width:240px; font-family:inherit;
  }
  .toolbar input::placeholder { color:var(--fg3); }
  .toolbar button {
    background:var(--ink2); border:1px solid var(--stroke); border-radius:8px; color:var(--fg2);
    padding:8px 14px; font-size:13px; cursor:pointer; font-family:inherit;
  }
  .toolbar button:hover { color:var(--fg); border-color:var(--iris); }
  .section { border:1px solid var(--stroke); border-radius:12px; margin:0 0 12px; overflow:hidden; background:var(--ink1); }
  .section > summary {
    list-style:none; cursor:pointer; display:flex; align-items:center; gap:12px;
    padding:14px 18px; user-select:none; border-left:3px solid var(--accent,var(--iris));
  }
  .section > summary::-webkit-details-marker { display:none; }
  .sec-title { font-weight:600; font-size:15px; flex:0 1 auto; }
  .sec-meta { color:var(--fg3); font-size:12px; font-family:'JetBrains Mono',ui-monospace,monospace; }
  .sec-chev { margin-left:auto; color:var(--fg3); transition:transform .15s; }
  .section[open] > summary .sec-chev { transform:rotate(90deg); }
  .sec-body { padding:0 4px 6px; overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th {
    text-align:left; padding:8px 14px; color:var(--fg3); font-weight:600; font-size:11px;
    text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid var(--stroke); white-space:nowrap;
  }
  td { padding:8px 14px; border-bottom:1px solid var(--ink3); vertical-align:top; }
  tbody tr:hover { background:var(--ink2); }
  tbody tr:last-child td { border-bottom:none; }
  .badge { font-size:11px; padding:2px 8px; border-radius:999px; font-weight:600; white-space:nowrap; }
  .badge.include { background:rgba(110,98,229,.18); color:#B2ABF5; }
  .badge.exclude { background:rgba(255,92,108,.16); color:#FF97A2; }
  .badge.virtual { background:rgba(255,176,32,.16); color:#FFC65C; }
  .empty { padding:40px; text-align:center; color:var(--fg3); }
  footer { margin-top:32px; color:var(--fg3); font-size:12px; text-align:center; }
  footer a { color:var(--iris); text-decoration:none; }
  .hidden { display:none !important; }
  @media print {
    body { background:#fff; color:#111; }
    .toolbar, .sec-chev { display:none; }
    .section, .tile, .chip { border-color:#ddd; background:#fff; }
    header.cover { background:#211d4a; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .section > summary { border-left-color:var(--accent); }
    th { color:#555; } td { border-color:#eee; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="cover">
    <div class="eyebrow">Intune Mission Control</div>
    <h1>Assignment Report</h1>
    <div class="cover-meta">
      <span>Tenant <b>${esc(meta.tenantName)}</b></span>
      <span>Generated <b>${esc(meta.generatedAt)}</b></span>
      <span>By <b>${esc(meta.generatedBy)}</b></span>
      <span>Grouped by <b>${esc(groupingLabel)}</b></span>
    </div>
  </header>

  <div class="tiles">
    ${statTile(s.policies, "Policies", "#6E62E5")}
    ${statTile(s.groups, "Groups targeted", "#3DDC97")}
    ${statTile(s.assignments, "Assignments", "#FFB020")}
    ${statTile(s.exclusions, "Exclusions", "#FF5C6C")}
    ${statTile(s.broad, "Broad (All Users/Devices)", "#FFC65C")}
  </div>

  <div class="chips">${typeChips}</div>

  <div class="toolbar">
    <input type="text" id="q" placeholder="Filter this report… (policy, group, filter)">
    <button onclick="toggleAll(true)">Expand all</button>
    <button onclick="toggleAll(false)">Collapse all</button>
    <button onclick="window.print()">Print / PDF</button>
  </div>

  <div id="report">
    ${sections}
  </div>

  <footer>
    Generated by Intune Mission Control · This file is self-contained and can be shared or archived.
  </footer>
</div>

<script>
  function toggleAll(open) {
    document.querySelectorAll('details.section').forEach(function(d){ d.open = open; });
  }
  var q = document.getElementById('q');
  q.addEventListener('input', function() {
    var term = q.value.trim().toLowerCase();
    document.querySelectorAll('details.section').forEach(function(sec){
      var anyRow = false;
      sec.querySelectorAll('tbody tr').forEach(function(tr){
        var hit = !term || tr.textContent.toLowerCase().indexOf(term) !== -1;
        tr.classList.toggle('hidden', !hit);
        if (hit) anyRow = true;
      });
      var titleHit = sec.querySelector('summary').textContent.toLowerCase().indexOf(term) !== -1;
      sec.classList.toggle('hidden', !!term && !anyRow && !titleHit);
      if (term) sec.open = true;
    });
  });
</script>
</body>
</html>`;
}

/** Trigger a browser download of the report HTML. */
export function downloadReportHtml(html: string, tenantName: string, dateStamp: string): void {
  const safe = tenantName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "tenant";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intune-assignment-report-${safe}-${dateStamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
