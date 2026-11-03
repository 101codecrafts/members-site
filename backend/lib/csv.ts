/**
 * CSV export with formula-injection protection (SR-18 / CWE-1236): any cell
 * starting with = + - @ TAB or CR is prefixed with a single quote so
 * Excel/Sheets treat it as text.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ReadonlyArray<Record<string, unknown>>, columns?: string[]): string {
  const first = rows[0];
  const cols = columns ?? (first ? Object.keys(first) : []);
  const lines = [cols.map(csvCell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}
