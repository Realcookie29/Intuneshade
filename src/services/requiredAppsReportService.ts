import type { PolicyRow } from "../types/policyTypes";

export type AppPlatform = "Windows" | "iOS/iPadOS" | "macOS" | "Android" | "Web" | "Other";

export type RequiredAppsGrouping = "platform" | "app" | "group";

export interface RequiredAppsReportOptions {
  grouping: RequiredAppsGrouping;
  includeVirtual: boolean;    // include "All Users" / "All Devices" targets
  includeExclusions: boolean; // include exclusion-group assignments
  includeFilters: boolean;    // render the assignment-filter column
}

export interface RequiredAppsReportMeta {
  tenantName: string;
  generatedBy: string;
  generatedAt: string; // preformatted date string (Date.* is avoided in shared code paths)
}

export const PLATFORM_ORDER: AppPlatform[] = [
  "Windows",
  "iOS/iPadOS",
  "macOS",
  "Android",
  "Web",
  "Other",
];

export const PLATFORM_COLORS: Record<AppPlatform, string> = {
  Windows: "#4FC3F7",
  "iOS/iPadOS": "#6E62E5",
  macOS: "#3DDC97",
  Android: "#FFB020",
  Web: "#4DB6AC",
  Other: "#6B7386",
};

/**
 * Derive the target platform of a mobileApp from its Graph @odata.type
 * (e.g. "#microsoft.graph.win32LobApp" → Windows). Graph has no platform
 * property on mobileApps, so the resource type is the only reliable signal.
 */
export function getAppPlatform(odataType: string): AppPlatform {
  const t = odataType.replace("#microsoft.graph.", "").toLowerCase();

  if (t.startsWith("macos")) return "macOS";
  if (t.startsWith("ios") || t.startsWith("managedios") || t.startsWith("ipados")) return "iOS/iPadOS";
  if (t.startsWith("android") || t.startsWith("managedandroid")) return "Android";
  if (t.startsWith("win") || t.startsWith("microsoftstoreforbusiness") || t.startsWith("officesuite")) {
    return "Windows";
  }
  if (t === "webapp") return "Web";
  return "Other";
}

/** Human-readable app type, e.g. "win32LobApp" → "Win32 Lob App". */
export function getAppTypeLabel(odataType: string): string {
  const t = odataType.replace("#microsoft.graph.", "");
  if (!t) return "—";
  return t
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export interface RequiredAppRecord {
  appId: string;
  appName: string;
  appType: string;
  platform: AppPlatform;
  target: string;
  targetKind: "group" | "allUsers" | "allDevices";
  mode: "include" | "exclude";
  filterName: string;
  filterType: string;
}

/**
 * Reduce the Applications table rows down to the Required-intent assignments
 * the report should contain.
 */
export function selectRequiredApps(
  rows: PolicyRow[],
  opts: RequiredAppsReportOptions,
): RequiredAppRecord[] {
  return rows
    .filter((r) => r.installIntent === "required")
    .filter((r) => opts.includeExclusions || r.assignmentType !== "Exclude")
    .filter(
      (r) =>
        opts.includeVirtual ||
        (r.assignmentType !== "All Users" && r.assignmentType !== "All Devices"),
    )
    .map((r) => ({
      appId: r.policyId,
      appName: r.policyName,
      appType: getAppTypeLabel(r.policyOdataType),
      platform: getAppPlatform(r.policyOdataType),
      target:
        r.assignmentType === "All Users" || r.assignmentType === "All Devices"
          ? r.assignmentType
          : r.groupDisplayName || "(unknown group)",
      targetKind:
        r.assignmentType === "All Users"
          ? "allUsers"
          : r.assignmentType === "All Devices"
            ? "allDevices"
            : "group",
      mode: r.assignmentType === "Exclude" ? "exclude" : "include",
      filterName: r.filterDisplayName,
      filterType: r.filterType ?? "",
    }));
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Summary {
  apps: number;
  assignments: number;
  groups: number;
  exclusions: number;
  broad: number;
  byPlatform: { platform: AppPlatform; apps: number; assignments: number }[];
}

function summarize(records: RequiredAppRecord[]): Summary {
  const appIds = new Set<string>();
  const groups = new Set<string>();
  const perPlatform = new Map<AppPlatform, { apps: Set<string>; assignments: number }>();
  let exclusions = 0;
  let broad = 0;

  for (const r of records) {
    appIds.add(r.appId);
    if (r.targetKind === "group") groups.add(r.target);
    else broad++;
    if (r.mode === "exclude") exclusions++;
    if (!perPlatform.has(r.platform)) perPlatform.set(r.platform, { apps: new Set(), assignments: 0 });
    const p = perPlatform.get(r.platform)!;
    p.apps.add(r.appId);
    p.assignments++;
  }

  return {
    apps: appIds.size,
    assignments: records.length,
    groups: groups.size,
    exclusions,
    broad,
    byPlatform: PLATFORM_ORDER.filter((p) => perPlatform.has(p)).map((p) => ({
      platform: p,
      apps: perPlatform.get(p)!.apps.size,
      assignments: perPlatform.get(p)!.assignments,
    })),
  };
}

function modeBadge(r: RequiredAppRecord): string {
  if (r.mode === "exclude") return `<span class="badge exclude">Exclude</span>`;
  if (r.targetKind !== "group") return `<span class="badge virtual">${esc(r.target)}</span>`;
  return `<span class="badge include">Include</span>`;
}

function platformCell(p: AppPlatform): string {
  return `<span class="type-dot" style="background:${PLATFORM_COLORS[p]}"></span>${esc(p)}`;
}

function filterCell(r: RequiredAppRecord): string {
  if (!r.filterName) return "—";
  return `${esc(r.filterName)}${r.filterType ? ` <span class="badge ghost">${esc(r.filterType)}</span>` : ""}`;
}

/**
 * Every row carries its raw values as data-* attributes so the in-report
 * platform filter, the search box and the CSV export can all work off the DOM
 * without re-embedding the dataset as JSON.
 */
function rowAttrs(r: RequiredAppRecord): string {
  return [
    `data-platform="${esc(r.platform)}"`,
    `data-app="${esc(r.appId)}"`,
    `data-appname="${esc(r.appName)}"`,
    `data-apptype="${esc(r.appType)}"`,
    `data-target="${esc(r.target)}"`,
    `data-mode="${r.mode === "exclude" ? "Exclude" : "Include"}"`,
    `data-filter="${esc(r.filterName)}"`,
  ].join(" ");
}

function table(headers: string[], rows: { attrs: string; cells: string[] }[]): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr ${r.attrs}>${r.cells.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function section(title: string, meta: string, accent: string, platform: string, body: string): string {
  return `<details class="section" open data-section-platform="${esc(platform)}">
  <summary style="--accent:${accent}">
    <span class="sec-title">${esc(title)}</span>
    <span class="sec-meta">${esc(meta)}</span>
    <span class="sec-chev">&#9656;</span>
  </summary>
  <div class="sec-body">${body}</div>
</details>`;
}

function buildSections(records: RequiredAppRecord[], opts: RequiredAppsReportOptions): string {
  const filterHeader = opts.includeFilters ? ["Filter"] : [];

  if (opts.grouping === "app") {
    const byApp = new Map<string, RequiredAppRecord[]>();
    for (const r of records) {
      if (!byApp.has(r.appId)) byApp.set(r.appId, []);
      byApp.get(r.appId)!.push(r);
    }
    return [...byApp.values()]
      .sort((a, b) => a[0].appName.localeCompare(b[0].appName))
      .map((rows) => {
        const head = rows[0];
        return section(
          head.appName,
          `${head.platform} · ${head.appType} · ${rows.length} targets`,
          PLATFORM_COLORS[head.platform],
          head.platform,
          table(
            ["Target", "Mode", ...filterHeader],
            rows
              .sort((a, b) => a.target.localeCompare(b.target))
              .map((r) => ({
                attrs: rowAttrs(r),
                cells: [
                  esc(r.target),
                  modeBadge(r),
                  ...(opts.includeFilters ? [filterCell(r)] : []),
                ],
              })),
          ),
        );
      })
      .join("\n");
  }

  if (opts.grouping === "group") {
    const byGroup = new Map<string, RequiredAppRecord[]>();
    for (const r of records) {
      if (!byGroup.has(r.target)) byGroup.set(r.target, []);
      byGroup.get(r.target)!.push(r);
    }
    return [...byGroup.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([target, rows]) => {
        const appCount = new Set(rows.map((r) => r.appId)).size;
        return section(
          target,
          `${appCount} apps · ${rows.length} assignments`,
          "#6E62E5",
          "", // mixed platforms — visibility is driven by its rows
          table(
            ["Application", "Platform", "App type", "Mode", ...filterHeader],
            rows
              .sort((a, b) => a.appName.localeCompare(b.appName))
              .map((r) => ({
                attrs: rowAttrs(r),
                cells: [
                  esc(r.appName),
                  platformCell(r.platform),
                  esc(r.appType),
                  modeBadge(r),
                  ...(opts.includeFilters ? [filterCell(r)] : []),
                ],
              })),
          ),
        );
      })
      .join("\n");
  }

  // Default: one collapsible section per platform.
  const byPlatform = new Map<AppPlatform, RequiredAppRecord[]>();
  for (const r of records) {
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, []);
    byPlatform.get(r.platform)!.push(r);
  }
  return PLATFORM_ORDER.filter((p) => byPlatform.has(p))
    .map((p) => {
      const rows = byPlatform.get(p)!;
      const appCount = new Set(rows.map((r) => r.appId)).size;
      return section(
        p,
        `${appCount} apps · ${rows.length} assignments`,
        PLATFORM_COLORS[p],
        p,
        table(
          ["Application", "App type", "Target", "Mode", ...filterHeader],
          rows
            .sort((a, b) => a.appName.localeCompare(b.appName) || a.target.localeCompare(b.target))
            .map((r) => ({
              attrs: rowAttrs(r),
              cells: [
                esc(r.appName),
                esc(r.appType),
                esc(r.target),
                modeBadge(r),
                ...(opts.includeFilters ? [filterCell(r)] : []),
              ],
            })),
        ),
      );
    })
    .join("\n");
}

function statTile(value: number | string, label: string, accent?: string): string {
  return `<div class="tile"${accent ? ` style="--tile:${accent}"` : ""}>
    <div class="tile-val">${esc(String(value))}</div>
    <div class="tile-label">${esc(label)}</div>
  </div>`;
}

/** Produces a fully self-contained HTML document (inline CSS + JS, no externals). */
export function buildRequiredAppsReportHtml(
  rows: PolicyRow[],
  opts: RequiredAppsReportOptions,
  meta: RequiredAppsReportMeta,
): string {
  const records = selectRequiredApps(rows, opts);
  const s = summarize(records);
  const groupingLabel =
    opts.grouping === "app" ? "application" : opts.grouping === "group" ? "target group" : "platform";

  const platformChips = s.byPlatform
    .map(
      (p) =>
        `<button class="chip pchip" data-platform="${esc(p.platform)}" type="button">
          <span class="type-dot" style="background:${PLATFORM_COLORS[p.platform]}"></span>
          ${esc(p.platform)} <b>${p.apps}</b>
        </button>`,
    )
    .join("");

  const sections = records.length
    ? buildSections(records, opts)
    : `<div class="empty">No Required app assignments match the selected options.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Required Applications — ${esc(meta.tenantName)}</title>
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
  .filterbar { margin:4px 0 18px; }
  .filterbar-label {
    color:var(--fg3); font-size:11px; text-transform:uppercase; letter-spacing:.06em;
    font-weight:600; margin-bottom:8px;
  }
  .chips { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .chip {
    background:var(--ink2); border:1px solid var(--stroke); border-radius:999px;
    padding:6px 13px; font-size:12px; color:var(--fg2); display:inline-flex; align-items:center; gap:6px;
    font-family:inherit;
  }
  .chip b { color:var(--fg); }
  .pchip { cursor:pointer; transition:border-color .12s, background .12s, color .12s; }
  .pchip:hover { border-color:var(--iris); color:var(--fg); }
  .pchip.active { background:rgba(110,98,229,.18); border-color:var(--iris); color:var(--fg); }
  .chip.reset { cursor:pointer; color:var(--fg3); }
  .chip.reset:hover { color:var(--fg); border-color:var(--iris); }
  .type-dot { width:9px; height:9px; border-radius:50%; display:inline-block; flex:0 0 auto; }
  .toolbar { display:flex; gap:8px; align-items:center; margin:0 0 10px; flex-wrap:wrap; }
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
  .counter { color:var(--fg3); font-size:12px; margin:0 0 16px;
             font-family:'JetBrains Mono',ui-monospace,monospace; }
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
  .badge.ghost { background:transparent; border:1px solid var(--stroke); color:var(--fg3); }
  .empty { padding:40px; text-align:center; color:var(--fg3); }
  footer { margin-top:32px; color:var(--fg3); font-size:12px; text-align:center; }
  .hidden { display:none !important; }
  @media print {
    body { background:#fff; color:#111; }
    .toolbar, .sec-chev, .pchip, .chip.reset, .filterbar-label { display:none; }
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
    <h1>Required Applications</h1>
    <div class="cover-meta">
      <span>Tenant <b>${esc(meta.tenantName)}</b></span>
      <span>Generated <b>${esc(meta.generatedAt)}</b></span>
      <span>By <b>${esc(meta.generatedBy)}</b></span>
      <span>Grouped by <b>${esc(groupingLabel)}</b></span>
      <span>Intent <b>Required only</b></span>
    </div>
  </header>

  <div class="tiles">
    ${statTile(s.apps, "Required apps", "#6E62E5")}
    ${statTile(s.assignments, "Assignments", "#FFB020")}
    ${statTile(s.groups, "Groups targeted", "#3DDC97")}
    ${statTile(s.broad, "All Users/Devices", "#FFC65C")}
    ${statTile(s.exclusions, "Exclusions", "#FF5C6C")}
  </div>

  <div class="filterbar">
    <div class="filterbar-label">Filter by platform</div>
    <div class="chips" id="platforms">
      ${platformChips}
      <button class="chip reset" id="resetPlatforms" type="button">Show all</button>
    </div>
  </div>

  <div class="toolbar">
    <input type="text" id="q" placeholder="Search app, group or filter…">
    <button type="button" onclick="toggleAll(true)">Expand all</button>
    <button type="button" onclick="toggleAll(false)">Collapse all</button>
    <button type="button" id="csv">Export CSV</button>
    <button type="button" onclick="window.print()">Print / PDF</button>
  </div>

  <div class="counter" id="counter"></div>

  <div id="report">
    ${sections}
  </div>

  <footer>
    Generated by Intune Mission Control · This file is self-contained and can be shared or archived.
  </footer>
</div>

<script>
  var active = new Set();
  var q = document.getElementById('q');
  var counter = document.getElementById('counter');

  function toggleAll(open) {
    document.querySelectorAll('details.section:not(.hidden)').forEach(function(d){ d.open = open; });
  }

  function apply() {
    var term = q.value.trim().toLowerCase();
    var shown = 0, total = 0;
    var apps = {};

    document.querySelectorAll('details.section').forEach(function(sec){
      var any = false;
      sec.querySelectorAll('tbody tr').forEach(function(tr){
        total++;
        var pOk = active.size === 0 || active.has(tr.getAttribute('data-platform'));
        var tOk = !term || tr.textContent.toLowerCase().indexOf(term) !== -1;
        var hit = pOk && tOk;
        tr.classList.toggle('hidden', !hit);
        if (hit) { any = true; shown++; apps[tr.getAttribute('data-app')] = 1; }
      });
      sec.classList.toggle('hidden', !any);
      if (any && (term || active.size)) sec.open = true;
    });

    counter.textContent = 'Showing ' + shown + ' of ' + total + ' assignments · '
      + Object.keys(apps).length + ' apps'
      + (active.size ? ' · platform: ' + Array.from(active).join(', ') : '');
  }

  document.querySelectorAll('.pchip').forEach(function(chip){
    chip.addEventListener('click', function(){
      var p = chip.getAttribute('data-platform');
      if (active.has(p)) { active.delete(p); chip.classList.remove('active'); }
      else { active.add(p); chip.classList.add('active'); }
      apply();
    });
  });

  document.getElementById('resetPlatforms').addEventListener('click', function(){
    active.clear();
    document.querySelectorAll('.pchip').forEach(function(c){ c.classList.remove('active'); });
    q.value = '';
    apply();
  });

  q.addEventListener('input', apply);

  document.getElementById('csv').addEventListener('click', function(){
    var head = ['Application','Platform','App type','Target','Mode','Filter'];
    var lines = [head.join(',')];
    document.querySelectorAll('tbody tr:not(.hidden)').forEach(function(tr){
      var cells = [
        tr.getAttribute('data-appname'),
        tr.getAttribute('data-platform'),
        tr.getAttribute('data-apptype'),
        tr.getAttribute('data-target'),
        tr.getAttribute('data-mode'),
        tr.getAttribute('data-filter')
      ].map(function(v){ return '"' + String(v || '').replace(/"/g, '""') + '"'; });
      lines.push(cells.join(','));
    });
    var blob = new Blob([lines.join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'required-applications.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  apply();
</script>
</body>
</html>`;
}

/** Trigger a browser download of the report HTML. */
export function downloadRequiredAppsReport(html: string, tenantName: string, dateStamp: string): void {
  const safe =
    tenantName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "tenant";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intune-required-apps-${safe}-${dateStamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
