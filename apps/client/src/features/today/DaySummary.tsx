import { Check } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { getMarkdown } from '@nexo/shared';
import type { DefaultHabitKey } from '@nexo/shared';
import { ProgressRing, cn } from '@nexo/ui';
import { getDailyLog } from '../../db';
import { focusRing } from './HabitTile';

export interface DaySummaryProps {
  date: string;
  done: number;
  total: number;
  /** Chaves dos hábitos pendentes, na ordem da tela (hábitos próprios vêm como null). */
  pendingKeys: (DefaultHabitKey | null)[];
}

const GUIDE_BY_HABIT: Partial<Record<DefaultHabitKey, string>> = {
  movement: 'caminhada',
  active_breaks: 'pausas-ativas',
  mobility: 'mobilidade',
  breathing: 'respiracao',
  sleep: 'sono',
};
const FALLBACK_GUIDE = 'aos-poucos';

export function guideForPending(keys: (DefaultHabitKey | null)[]): string {
  for (const key of keys) {
    const slug = key && GUIDE_BY_HABIT[key];
    if (slug) return slug;
  }
  return FALLBACK_GUIDE;
}

const pillLink = cn(
  'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold',
  focusRing,
);

// Coluna direita do computador (≥ 1280 px): anel grande, atalho do registro e uma dica do Aprender.
export function DaySummary({ date, done, total, pendingKeys }: DaySummaryProps) {
  const { t } = useTranslation();
  const log = useLiveQuery(() => getDailyLog(date), [date]);
  const slug = guideForPending(pendingKeys);
  const guide = getMarkdown(`guia/${slug}.md`).meta;

  return (
    <aside aria-label={t('today.summary.label')} className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-tile border border-tile-edge bg-tile-water p-6 text-tile-ink grain dark:bg-none">
        <ProgressRing
          value={total === 0 ? 0 : done / total}
          size={152}
          stroke={12}
          label={t('today.summary.ring', { done, total })}
          className="text-navy dark:text-peach"
        >
          <span className="flex items-baseline gap-1 text-tile-ink">
            <span className="text-5xl leading-none font-extrabold tracking-[-0.04em]">{done}</span>
            <span className="text-base font-semibold">/{total}</span>
          </span>
        </ProgressRing>
        <p aria-hidden="true" className="text-sm font-semibold">
          {t('today.summary.ringCaption')}
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-tile border-2 border-text/70 p-5">
        <h2 className="text-lg leading-tight font-extrabold tracking-[-0.02em]">
          {t('today.summary.logTitle')}
        </h2>
        <p className="text-sm text-muted">{t('today.summary.logHint')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {log ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm font-extrabold">
                <Check aria-hidden="true" className="size-4" strokeWidth={3} />
                {t('today.summary.logged')}
              </span>
              <Link to="/registro" className={cn(pillLink, 'border-2 border-current')}>
                {t('today.summary.loggedCta')}
              </Link>
            </>
          ) : (
            <Link to="/registro" className={cn(pillLink, 'bg-or text-navy hover:brightness-105')}>
              {t('today.summary.logCta')}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-tile border border-tile-edge bg-tile-breaks p-5 text-tile-ink grain dark:bg-none">
        <p className="eyebrow text-tile-label-breaks">{t('today.summary.learn')}</p>
        <h2 className="text-lg leading-tight font-extrabold tracking-[-0.02em]">
          <Link
            to={`/aprender/guia/${slug}`}
            className={cn(
              'inline-flex min-h-11 items-center underline decoration-2 underline-offset-4',
              focusRing,
            )}
          >
            {guide.title ?? slug}
          </Link>
        </h2>
        {guide.summary && <p className="text-sm">{guide.summary}</p>}
      </div>
    </aside>
  );
}
