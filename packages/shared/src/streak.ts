import { STREAK_THRESHOLD } from './constants';
import { lastNDateKeys } from './dates';

const prevKey = (key: string) => lastNDateKeys(key, 2)[0] as string;

/** Dia válido: ratio >= STREAK_THRESHOLD. Data ausente quebra a sequência. */
export function computeStreak(
  ratiosByDate: Record<string, number>,
  today: string,
): { current: number; best: number } {
  const valid = (k: string) => (ratiosByDate[k] ?? 0) >= STREAK_THRESHOLD;

  let current = 0;
  // hoje ainda inválido não zera o streak: conta a partir de ontem
  let k = valid(today) ? today : prevKey(today);
  while (valid(k)) {
    current++;
    k = prevKey(k);
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of Object.keys(ratiosByDate).sort()) {
    if (!valid(key)) continue;
    run = prev !== null && prevKey(key) === prev ? run + 1 : 1;
    prev = key;
    if (run > best) best = run;
  }
  return { current, best };
}
