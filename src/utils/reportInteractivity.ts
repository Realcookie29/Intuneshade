/**
 * Interactivity for the self-contained HTML reports.
 *
 * The site CSP is `script-src 'self'`, and both a srcdoc iframe and a
 * document.write()'d about:blank tab inherit it — so an inline <script> in the
 * report is blocked in the preview and in "Open in new tab". Only the
 * downloaded file runs it.
 *
 * Each report therefore defines its behaviour as one plain function that takes
 * the report's window. It is serialised into the HTML for the downloaded file,
 * and called directly from the app (whose code the CSP allows) for the preview
 * and the new tab. The function must be self-contained — no references to
 * module scope — and must guard against running twice (in dev there is no CSP,
 * so the inline copy runs before the app wires it).
 */
export type ReportScript = (win: Window) => void;

/** The <script> block embedded in the report HTML (effective in the downloaded file). */
export function inlineReportScript(fn: ReportScript): string {
  return `<script>(${fn.toString()})(window);</script>`;
}

/** Runs the report's behaviour from the app, e.g. on an iframe's load event. */
export function wireReport(win: Window | null | undefined, fn: ReportScript): void {
  if (!win) return;
  try {
    fn(win);
  } catch (e) {
    console.error("Report interactivity failed to initialise", e);
  }
}

/** Opens report HTML in a new tab and wires its behaviour. */
export function openReportInNewTab(html: string, fn: ReportScript): void {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  wireReport(w, fn);
}
