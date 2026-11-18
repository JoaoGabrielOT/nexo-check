import type { Question } from '@nexo/shared';

/** Alfabeto do código de sessão (sem 0, 1, I, L, O), 6 caracteres. */
export const SESSION_CODE_PATTERN = '[2-9A-HJKMNP-Z]{6}';
export const SESSION_CODE_RE = new RegExp(`^${SESSION_CODE_PATTERN}$`);

/** "dd/mm" na hora local, a partir de um instante ISO. */
export function formatDayMonth(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Nota do educativo em % inteiro, arredondada para baixo (sem erro de ponto flutuante). */
export function scorePercent(correct: number, total: number): number {
  return total === 0 ? 0 : Math.floor((correct * 100) / total);
}

// "(1 = muito ruim, 5 = muito boa)" no fim do enunciado de escalas e "(opcional; …)" nos textos.
const SCALE_HINT = /\s*\(\s*\d+\s*=\s*([^,)]+?)\s*,\s*\d+\s*=\s*([^)]+?)\s*\)\s*$/;
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/;

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Enunciado sem as dicas entre parênteses que a tela já mostra de outro jeito. */
export function questionTitle(q: Question): string {
  if (q.type === 'scale') return q.label.replace(SCALE_HINT, '');
  if (q.type === 'text') return q.label.replace(TRAILING_PAREN, '');
  return q.label;
}

/** Palavras dos 5 pontos da escala: das options, ou dos extremos citados no enunciado. */
export function scaleWords(q: Question): [string, string, string, string, string] {
  if (q.options?.length === 5) {
    const w = q.options.map((o) => o.label);
    return [w[0] ?? '', w[1] ?? '', w[2] ?? '', w[3] ?? '', w[4] ?? ''];
  }
  const m = SCALE_HINT.exec(q.label);
  return [upperFirst(m?.[1] ?? ''), '', '', '', upperFirst(m?.[2] ?? '')];
}

export function optionLabel(q: Question, value: string): string {
  return q.options?.find((o) => o.value === value)?.label ?? value;
}

export function isAnswered(q: Question, v: unknown): boolean {
  if (q.type === 'text') return true;
  if (q.type === 'multi') return Array.isArray(v) && v.length > 0;
  return v !== undefined && v !== '';
}

/** Nota gravada (0–1) em % inteiro, para baixo; a folga evita 0,57 virar 56. */
export function ratioPercent(ratio: number): number {
  return Math.floor(ratio * 100 + 1e-6);
}
