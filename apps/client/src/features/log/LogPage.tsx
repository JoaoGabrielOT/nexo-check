import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lastNDateKeys } from '@nexo/shared';
import type { Scale } from '@nexo/shared';
import { Button, Panel, ScalePicker, toast } from '@nexo/ui';
import { getDailyLog, saveDailyLog } from '../../db';
import { useToday } from '../today/useToday';

const DAYS_BACK = 7;
const formatDay = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

interface Values {
  stress: Scale | null;
  mood: Scale | null;
  energy: Scale | null;
  sleepQuality: Scale | null;
}
const EMPTY: Values = { stress: null, mood: null, energy: null, sleepQuality: null };

const SCALES = [
  { field: 'stress', i18n: 'stress' },
  { field: 'mood', i18n: 'mood' },
  { field: 'energy', i18n: 'energy' },
  { field: 'sleepQuality', i18n: 'sleep' },
] as const;

const fieldClass =
  'min-h-11 w-full rounded-card border-2 border-border bg-surface px-4 py-2 text-text ' +
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

  useEffect(() => {
    let cancelled = false;
    void getDailyLog(date).then((log) => {
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
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

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
    } catch {
      toast(t('errors.generic'));
    }
  };

  const complete = stress !== null && mood !== null && energy !== null && sleepQuality !== null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.log')}</h1>
      <p>{t('log.intro')}</p>
      <Panel className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="log-day" className="font-extrabold">
            {t('log.day')}
          </label>
          <select
            id="log-day"
            className={fieldClass}
            value={date}
            onChange={(e) => setPicked(e.target.value)}
          >
            {options.map((key) => (
              <option key={key} value={key}>
                {key === today ? t('log.todaySuffix', { date: formatDay(key) }) : formatDay(key)}
              </option>
            ))}
          </select>
        </div>
        <h2 className="text-lg font-extrabold">{t('log.question')}</h2>
        {loadedDate === date &&
          SCALES.map(({ field, i18n }) => (
            <ScalePicker
              key={`${date}-${field}`}
              label={t(`log.${i18n}`)}
              lowLabel={t(`log.${i18n}Low`)}
              highLabel={t(`log.${i18n}High`)}
              value={values[field]}
              onChange={(v) => setValues((s) => ({ ...s, [field]: v }))}
            />
          ))}
        <div className="flex flex-col gap-2">
          <label htmlFor="log-note" className="font-extrabold">
            {t('log.note')}
          </label>
          <textarea
            id="log-note"
            rows={4}
            className={fieldClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button disabled={!complete} onClick={() => void save()}>
          {t('log.save')}
        </Button>
      </Panel>
    </div>
  );
}
