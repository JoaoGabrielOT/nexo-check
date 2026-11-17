const BOM = String.fromCharCode(0xfeff);

type Cell = string | number | boolean | null;

const cell = (v: Cell): string => {
  if (v === null) return '';
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV para Excel pt-BR: BOM UTF-8, separador `;`, linhas CRLF. */
export function toCsv(rows: Record<string, Cell>[], columns: string[]): string {
  const lines = [columns.map(cell).join(';')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c] ?? null)).join(';'));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
