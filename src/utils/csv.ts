// CSV helpers shared by every export. Tenant strings (group, app, policy names)
// are untrusted: a value starting with = + - @ tab or CR would run as a formula
// when the file is opened in Excel, so it gets a leading apostrophe.

export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
