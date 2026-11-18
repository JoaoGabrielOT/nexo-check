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
  // Sem meta de movimento (hábito inativo ou alvo 0) ou meta já cumprida: não cobra caminhada.
  if (movementTarget <= 0 || movementMinutes >= movementTarget) return 'today.suggestion.recover';
  if (movementMinutes < WALK_MINUTES) return 'today.suggestion.walk10';
  return 'today.suggestion.keepGoing';
}
