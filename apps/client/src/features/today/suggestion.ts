export interface DaySuggestionState {
  movementMinutes: number;
  movementTarget: number;
  done: number;
  total: number;
  /** Hora local (0–23); reservada para variações de texto por período do dia. */
  hour: number;
}

const WALK_MINUTES = 10;

/** Chave i18n da sugestão do dia: convida, nunca cobra. */
export function getDaySuggestion({
  movementMinutes,
  movementTarget,
  done,
  total,
}: DaySuggestionState): string {
  if (total > 0 && done >= total) return 'today.suggestion.allDone';
  if (movementMinutes < WALK_MINUTES) return 'today.suggestion.walk10';
  if (movementMinutes < movementTarget) return 'today.suggestion.keepGoing';
  return 'today.suggestion.recover';
}
