import { ChevronDown, Sprout } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lastNDateKeys } from '@nexo/shared';
import type { Scale } from '@nexo/shared';
import { Button, PageHeader, ScalePills, Tile, toast } from '@nexo/ui';
import type { TileTone } from '@nexo/ui';
import { getDailyLog, saveDailyLog } from '../../db';
import { formatLongDate } from '../../lib/dates';
import { useToday } from '../today/useToday';
import { getAfterSaveMessage } from './afterSave';

const DAYS_BACK = 7;
const formatDay = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

interface Values {
  stress: Scale | null;
  mood: Scale | null;
  energy: Scale | null;
  sleepQuality: Scale | null;
}
const EMPTY: Values = { stress: null, mood: null, energy: null, sleepQuality: null };

// Tintas diferentes por escala (nada de quatro blocos iguais); lavanda fica de fora porque as pílulas já são lavanda.
const SCALES = [
  { field: 'stress', i18n: 'stress', tone: 'breaks' },
  { field: 'mood', i18n: 'mood', tone: 'sleep' },
  { field: 'energy', i18n: 'energy', tone: 'breathing' },
  { field: 'sleepQuality', i18n: 'sleep', tone: 'plain' },
] as const satisfies readonly { field: keyof Values; i18n: string; tone: TileTone }[];

type Words = [string, string, string, string, string];

const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

export function LogPage() {
  const { t } = useTranslation();
  const today = useToday();
  const options = useMemo(() => lastNDateKeys(today, DAYS_BACK).reverse(), [today]);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && options.includes(picked) ? picked : today;
  const [values, setValues] = useState<Values>(EMPTY);
  const [note, setNote] = useState('');
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Dia em exibição agora: o save confere depois do await, para não mostrar a frase no dia errado.
  const dateRef = useRef(date);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    getDailyLog(date)
      .then((log) => {
        if (cancelled) return;
        setValues(
          log
            ? {
                stress: log.stress,
                mood: log.mood,
                energy: log.energy,
                sleepQuality: log.sleepQuality,
              }
            : EMPTY,
        );
        setNote(log?.note ?? '');
        setLoadedDate(date);
      })
      .catch(() => {
        if (!cancelled) toast(t('errors.generic'));
      });
    return () => {
      cancelled = true;
    };
  }, [date, t]);

  const { stress, mood, energy, sleepQuality } = values;

  const save = async () => {
    if (stress === null || mood === null || energy === null || sleepQuality === null) return;
    try {
      await saveDailyLog({
        id: date,
        date,
        stress,
        mood,
        energy,
        sleepQuality,
        note: note.trim() === '' ? null : note,
      });
      toast(t('log.saved'));
      if (dateRef.current === date) {
        setMessage(t(getAfterSaveMessage({ stress, mood, energy, sleepQuality })));
      }
    } catch {
      toast(t('errors.generic'));
    }
  };

  const loaded = loadedDate === date;
  const complete = stress !== null && mood !== null && energy !== null && sleepQuality !== null;
  const words = (key: string) => t(`log.words.${key}`, { returnObjects: true }) as unknown as Words;

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 sm:gap-5">
      <PageHeader
        eyebrow={formatLongDate(date, t)}
        title={t('log.question')}
        meta={<p className="max-w-prose">{t('log.intro')}</p>}
        className="mb-1"
      />

      <div className="flex items-center gap-3">
        <label htmlFor="log-day" className="text-sm font-extrabold">
          {t('log.day')}
        </label>
        <div className="relative">
          <select
            id="log-day"
            className={`min-h-11 cursor-pointer appearance-none rounded-full border-2 border-text/70 bg-transparent py-2 pr-11 pl-5 text-sm font-bold text-text tabular-nums dark:bg-surface ${focusRing}`}
            value={date}
            onChange={(e) => {
              setPicked(e.target.value);
              setMessage(null);
            }}
          >
            {options.map((key) => (
              <option key={key} value={key}>
                {key === today ? t('log.todaySuffix', { date: formatDay(key) }) : formatDay(key)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
            strokeWidth={2.5}
          />
        </div>
      </div>

      {loaded && (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          {SCALES.map(({ field, i18n, tone }) => (
            <Tile key={`${date}-${field}`} tone={tone} label={t(`log.${i18n}`)} className="pb-4">
              <ScalePills
                label={t(`log.${i18n}`)}
                hideLabel
                words={words(i18n)}
                formatLabel={(n, word) => t('log.scaleOption', { n, word })}
                value={values[field]}
                onChange={(v) => {
                  setValues((s) => ({ ...s, [field]: v }));
                  setMessage(null);
                }}
              />
            </Tile>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-tile border-2 border-text/15 p-5 dark:border-tile-edge dark:bg-tile-plain">
        <label htmlFor="log-note" className="font-extrabold">
          {t('log.note')}
        </label>
        <textarea
          id="log-note"
          rows={3}
          className={`min-h-11 w-full resize-y rounded-control border-2 border-text/25 bg-surface px-4 py-3 text-text dark:border-tile-edge ${focusRing}`}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setMessage(null);
          }}
        />
        <Button
          disabled={!complete || !loaded}
          onClick={() => void save()}
          className="mt-1 min-h-12 self-start bg-or px-7 text-navy hover:bg-or/90 dark:bg-or dark:text-navy dark:hover:bg-or/90"
        >
          {t('log.save')}
        </Button>
      </div>

      <div aria-live="polite">
        {message && (
          <div className="flex items-start gap-4 rounded-panel bg-surface-2 p-6 text-text sm:p-7 dark:border dark:border-tile-edge dark:bg-tile-plain">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-navy text-[#f7f5f2] dark:bg-peach dark:text-navy"
            >
              <Sprout className="size-5" strokeWidth={2.25} />
            </span>
            <p className="max-w-prose pt-1.5 leading-relaxed font-semibold">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
