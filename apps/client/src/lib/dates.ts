import type { TFunction } from 'i18next';

/** "Terça, 17 de novembro" a partir de `YYYY-MM-DD` (data local). */
export function formatLongDate(key: string, t: TFunction): string {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/-feira$/, '');
  return t('today.dateTitle', {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    day: d,
    month: date.toLocaleDateString('pt-BR', { month: 'long' }),
  });
}
