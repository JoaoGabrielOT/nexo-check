const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` no fuso local (nunca UTC). */
export function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Mais antigo primeiro, inclui `today`. Calcula por dia de calendário (robusto a horário de verão). */
export function lastNDateKeys(today: string, n: number): string[] {
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(toLocalDateKey(new Date(y, m - 1, d - i, 12)));
  }
  return keys;
}
