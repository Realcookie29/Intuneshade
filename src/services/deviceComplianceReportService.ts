import {
  BUCKET_LABEL, BUCKET_COLOR, BUCKET_ORDER_HELPER,
  type ComplianceBucket, type ManagedDeviceLite, type ComplianceReason,
} from "./deviceComplianceService";

export interface ComplianceReportMeta {
  tenantName: string;
  generatedBy: string;
  generatedAt: string;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/** Produce a fully self-contained HTML compliance report (inline CSS, no externals). */
export function buildComplianceReportHtml(
  devices: ManagedDeviceLite[],
  reasons: ComplianceReason[],
  meta: ComplianceReportMeta,
): string {
  const total = devices.length;
  const counts: Record<ComplianceBucket, number> = { compliant: 0, noncompliant: 0, inGracePeriod: 0, error: 0, conflict: 0, unknown: 0 };
  for (const d of devices) counts[d.bucket]++;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const nonCompliantTotal = counts.noncompliant + counts.error + counts.conflict;

  const segments = BUCKET_ORDER_HELPER
    .filter((b) => counts[b] > 0)
    .map((b) => `<span style="width:${(counts[b] / (total || 1)) * 100}%;background:${BUCKET_COLOR[b]}" title="${esc(BUCKET_LABEL[b])}: ${counts[b]}"></span>`)
    .join("");

  const tiles = BUCKET_ORDER_HELPER.map((b) => `
    <div class="tile" style="--c:${BUCKET_COLOR[b]}">
      <div class="tile-val">${counts[b]}</div>
      <div class="tile-label">${esc(BUCKET_LABEL[b])}</div>
      <div class="tile-pct">${pct(counts[b])}%</div>
    </div>`).join("");

  const maxReason = reasons[0]?.nonCompliant ?? 1;
  const reasonsHtml = nonCompliantTotal > 0 && reasons.length
    ? `<h2>Top non-compliance reasons</h2>
       <div class="reasons">
       ${reasons.slice(0, 15).map((r) => `
         <div class="reason">
           <span class="rname">${esc(r.settingName)}</span>
           <span class="rtrack"><span class="rfill" style="width:${Math.max(3, (r.nonCompliant / maxReason) * 100)}%"></span></span>
           <span class="rnum">${r.nonCompliant} · ${pct(r.nonCompliant)}%</span>
         </div>`).join("")}
       </div>`
    : "";

  const attention = devices.filter((d) => d.bucket !== "compliant")
    .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.deviceName.localeCompare(b.deviceName));
  const deviceRows = attention.map((d) => `
    <tr>
      <td>${esc(d.deviceName)}</td>
      <td>${esc(d.userPrincipalName || "—")}</td>
      <td>${esc(`${d.operatingSystem} ${d.osVersion}`.trim() || "—")}</td>
      <td><span class="badge" style="--c:${BUCKET_COLOR[d.bucket]}">${esc(d.complianceState)}</span></td>
      <td>${esc(fmtDate(d.lastSyncDateTime))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Intune Device Compliance — ${esc(meta.tenantName)}</title>
<style>
  :root { --bg:#0B0D13; --ink1:#0E1017; --ink2:#131620; --stroke:#242A38; --fg:#E8EAF0; --fg2:#A9B0C0; --fg3:#6B7386; --mint:#3DDC97; }
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  body{background:var(--bg);color:var(--fg);font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.5}
  .wrap{max-width:1080px;margin:0 auto;padding:32px 24px 64px}
  header{background:linear-gradient(135deg,#0f2a22 0%,#123c30 60%,#16213e 100%);border:1px solid var(--stroke);border-radius:16px;padding:26px 30px;display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap}
  .eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--mint);font-weight:700}
  h1{font-size:28px;margin:6px 0 4px;font-family:'Space Grotesk','Inter',sans-serif}
  .meta{color:var(--fg2);font-size:13px;display:flex;gap:16px;flex-wrap:wrap;margin-top:6px}
  .meta b{color:var(--fg)}
  .big{text-align:right}
  .big .n{font-size:46px;font-weight:700;color:var(--mint);font-family:'Space Grotesk','Inter',sans-serif;line-height:1}
  .big .l{color:var(--fg2);font-size:13px}
  .stacked{display:flex;height:14px;border-radius:999px;overflow:hidden;margin:22px 0 6px;border:1px solid var(--stroke)}
  .stacked span{display:block;height:100%}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:16px 0 26px}
  .tile{background:var(--ink2);border:1px solid var(--stroke);border-radius:12px;padding:14px 16px;position:relative}
  .tile::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:0 2px 2px 0;background:var(--c)}
  .tile-val{font-size:26px;font-weight:700;font-family:'Space Grotesk','Inter',sans-serif;line-height:1}
  .tile-label{color:var(--fg3);font-size:12px;margin-top:6px}
  .tile-pct{color:var(--c);font-size:12px;font-family:'JetBrains Mono',monospace;margin-top:2px}
  h2{font-size:18px;margin:26px 0 12px}
  .reasons{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
  .reason{display:grid;grid-template-columns:minmax(200px,320px) 1fr 96px;gap:14px;align-items:center}
  .rname{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rtrack{height:10px;border-radius:999px;background:var(--ink2);overflow:hidden}
  .rfill{display:block;height:100%;border-radius:999px;background:#FF5C6C}
  .rnum{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--fg2);text-align:right}
  table{border-collapse:collapse;width:100%;font-size:13px;margin-top:4px}
  th{text-align:left;padding:8px 12px;color:var(--fg3);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--stroke);white-space:nowrap}
  td{padding:8px 12px;border-bottom:1px solid var(--ink1)}
  tbody tr:hover{background:var(--ink2)}
  .badge{font-size:11px;padding:2px 8px;border-radius:999px;font-weight:600;color:var(--c);border:1px solid var(--c);white-space:nowrap}
  .empty{padding:28px;text-align:center;color:var(--mint)}
  footer{margin-top:32px;color:var(--fg3);font-size:12px;text-align:center}
  @media print{body{background:#fff;color:#111}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}.tile,.rtrack,table td,table th{border-color:#ddd}}
</style></head>
<body><div class="wrap">
  <header>
    <div>
      <div class="eyebrow">Intune Mission Control</div>
      <h1>Device Compliance Report</h1>
      <div class="meta"><span>Tenant <b>${esc(meta.tenantName)}</b></span><span>Generated <b>${esc(meta.generatedAt)}</b></span><span>By <b>${esc(meta.generatedBy)}</b></span></div>
    </div>
    <div class="big"><div class="n">${pct(counts.compliant)}%</div><div class="l">compliant · ${total} devices</div></div>
  </header>

  <div class="stacked">${segments}</div>
  <div class="tiles">${tiles}</div>

  ${reasonsHtml}

  <h2>Devices needing attention (${attention.length})</h2>
  ${attention.length
    ? `<table><thead><tr><th>Device</th><th>User</th><th>OS</th><th>State</th><th>Last sync</th></tr></thead><tbody>${deviceRows}</tbody></table>`
    : `<div class="empty">✓ Every managed device is compliant.</div>`}

  <footer>Generated by Intune Mission Control · This file is self-contained and can be shared or archived.</footer>
</div></body></html>`;
}

/** Trigger a browser download of the compliance report HTML. */
export function downloadComplianceReport(html: string, tenantName: string, dateStamp: string): void {
  const safe = tenantName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "tenant";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intune-compliance-${safe}-${dateStamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
