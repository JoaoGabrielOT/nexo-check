export interface AfterSaveInput {
  stress: number;
  mood: number;
  energy: number;
  sleepQuality: number;
}

/** Chave i18n da frase de retorno depois de salvar: acolhe, sem diagnóstico nem meta. */
export function getAfterSaveMessage({ stress, mood, energy }: AfterSaveInput): string {
  if (stress >= 4 || mood <= 2) return 'log.after.hardDay';
  if (energy >= 4 && stress <= 2) return 'log.after.goodDay';
  return 'log.after.neutral';
}
