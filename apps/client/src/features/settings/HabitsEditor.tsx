import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Habit, HabitType } from '@nexo/shared';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Switch,
  Tile,
  toast,
} from '@nexo/ui';
import { deleteHabit, getHabits, saveHabit } from '../../db';
import { now } from '../../db/clock';
import { newId } from '../../db/ids';
import { NumberStepper } from './NumberStepper';

const NAME_MAX = 40;
const CEILING = { min: 10, max: 120, step: 5 } as const;
type CustomType = 'boolean' | 'counter' | 'minutes';
const CUSTOM_TYPES: CustomType[] = ['boolean', 'counter', 'minutes'];

const fmtHours = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Passo e limites da meta por tipo de hábito; boolean não tem meta numérica. */
const TARGET: Record<HabitType, { step: number; min: number; max: number } | null> = {
  boolean: null,
  counter: { step: 1, min: 1, max: 99 },
  minutes: { step: 5, min: 5, max: 600 },
  range_hours: { step: 0.5, min: 1, max: 24 },
};

const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';
const iconBtn = `grid size-11 cursor-pointer place-items-center rounded-full text-text transition-colors hover:bg-text/8 disabled:cursor-not-allowed disabled:opacity-35 ${focusRing}`;

export function HabitsEditor() {
  const { t } = useTranslation();
  const habits = useLiveQuery(getHabits, []);
  const [toDelete, setToDelete] = useState<Habit | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomType>('boolean');
  const [target, setTarget] = useState(1);
  // Toques rápidos: cada alteração lê o hábito do banco na sua vez, sem perder a anterior.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = (work: () => Promise<void>) => {
    queue.current = queue.current.then(work).catch(() => void toast(t('errors.generic')));
  };
  const patch = (id: string, change: (h: Habit) => Partial<Habit>) =>
    enqueue(async () => {
      const current = (await getHabits()).find((h) => h.id === id);
      if (current) await saveHabit({ ...current, ...change(current) });
    });
  const move = (id: string, dir: -1 | 1) =>
    enqueue(async () => {
      const list = await getHabits();
      const i = list.findIndex((h) => h.id === id);
      const a = list[i];
      const b = list[i + dir];
      if (!a || !b) return;
      // Renumera a lista inteira: também conserta ordens repetidas vindas de um backup.
      const reordered = [...list];
      reordered[i] = b;
      reordered[i + dir] = a;
      for (const [order, h] of reordered.entries()) {
        if (h.order !== order) await saveHabit({ ...h, order });
      }
    });
  const remove = (h: Habit) => {
    enqueue(() => deleteHabit(h.id));
    setToDelete(null);
  };
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    enqueue(async () => {
      const list = await getHabits();
      const order = list.reduce((max, h) => Math.max(max, h.order), -1) + 1;
      await saveHabit({
        id: newId(),
        key: null,
        name: trimmed,
        description: '',
        type,
        target: type === 'boolean' ? 1 : target,
        targetMax: null,
        active: true,
        order,
        progressive: null,
        updatedAt: now().toISOString(),
        deletedAt: null,
      });
      toast(t('settings.habits.added'));
    });
    setName('');
  };

  const pickType = (next: CustomType) => {
    setType(next);
    setTarget(next === 'minutes' ? 15 : 1);
  };
  const newLimits = TARGET[type];

  return (
    <Tile tone="plain" label={t('settings.habits.title')}>
      <p className="max-w-prose text-sm text-muted">{t('settings.habits.intro')}</p>
      <ul className="flex flex-col">
        {habits?.map((h, i) => {
          const limits = TARGET[h.type];
          return (
            <li
              key={h.id}
              className="flex flex-col gap-3 border-t border-text/12 py-4 first:border-t-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-extrabold">{h.name}</p>
                  {h.key === null && (
                    <p className="text-xs font-semibold text-muted">
                      {t('settings.habits.custom')}
                    </p>
                  )}
                </div>
                <Switch
                  checked={h.active}
                  aria-label={t('settings.habits.active', { name: h.name })}
                  onCheckedChange={(active) => patch(h.id, () => ({ active }))}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {limits && (
                  <NumberStepper
                    label={t('settings.habits.target', { name: h.name })}
                    value={h.target}
                    step={limits.step}
                    min={limits.min}
                    max={h.targetMax !== null ? h.targetMax : limits.max}
                    format={(n) =>
                      t(`settings.habits.unit.${h.type}`, {
                        n: h.type === 'range_hours' ? fmtHours(n) : n,
                      })
                    }
                    onChange={(next) => patch(h.id, () => ({ target: next }))}
                  />
                )}
                {h.type === 'range_hours' && h.targetMax !== null && (
                  <NumberStepper
                    label={t('settings.habits.targetMax', { name: h.name })}
                    value={h.targetMax}
                    step={limits?.step ?? 0.5}
                    min={h.target}
                    max={24}
                    format={(n) => t('settings.habits.unit.range_hours', { n: fmtHours(n) })}
                    onChange={(next) => patch(h.id, () => ({ targetMax: next }))}
                  />
                )}
                <div className="ml-auto flex items-center">
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label={t('settings.habits.moveUp', { name: h.name })}
                    disabled={i === 0}
                    onClick={() => move(h.id, -1)}
                  >
                    <ArrowUp aria-hidden="true" className="size-5" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label={t('settings.habits.moveDown', { name: h.name })}
                    disabled={i === habits.length - 1}
                    onClick={() => move(h.id, 1)}
                  >
                    <ArrowDown aria-hidden="true" className="size-5" />
                  </button>
                  {h.key === null && (
                    <button
                      type="button"
                      className={iconBtn}
                      aria-label={t('settings.habits.delete', { name: h.name })}
                      onClick={() => setToDelete(h)}
                    >
                      <Trash2 aria-hidden="true" className="size-5" />
                    </button>
                  )}
                </div>
              </div>

              {h.key === 'movement' && h.progressive && (
                <div className="flex flex-col gap-3 rounded-control bg-text/6 p-4 dark:bg-white/6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-extrabold">{t('settings.habits.progressive')}</p>
                      <p className="max-w-prose text-sm text-muted">
                        {t('settings.habits.progressiveHint')}
                      </p>
                    </div>
                    <Switch
                      checked={h.progressive.enabled}
                      aria-label={t('settings.habits.progressive')}
                      onCheckedChange={(enabled) =>
                        patch(h.id, (cur) => ({
                          progressive: { ceiling: CEILING.min, ...cur.progressive, enabled },
                        }))
                      }
                    />
                  </div>
                  {h.progressive.enabled && (
                    <NumberStepper
                      label={t('settings.habits.ceiling')}
                      value={h.progressive.ceiling}
                      {...CEILING}
                      format={(n) => t('settings.habits.unit.minutes', { n })}
                      onChange={(ceiling) =>
                        patch(h.id, (cur) => ({
                          progressive: { enabled: true, ...cur.progressive, ceiling },
                        }))
                      }
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="flex flex-col gap-3 border-t border-text/12 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <h3 className="font-extrabold">{t('settings.habits.addTitle')}</h3>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          {t('settings.habits.name')}
          <Input
            value={name}
            maxLength={NAME_MAX}
            placeholder={t('settings.habits.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="-mt-2 text-xs font-semibold text-muted">{t('settings.habits.nameHint')}</p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            {t('settings.habits.type')}
            <select
              className={`min-h-11 cursor-pointer rounded-full border-2 border-text/40 bg-surface px-4 text-sm font-bold text-text ${focusRing}`}
              value={type}
              onChange={(e) => pickType(e.target.value as CustomType)}
            >
              {CUSTOM_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`settings.habits.types.${k}`)}
                </option>
              ))}
            </select>
          </label>
          {newLimits && (
            <NumberStepper
              label={t('settings.habits.newTarget')}
              value={target}
              {...newLimits}
              format={(n) => t(`settings.habits.unit.${type}`, { n })}
              onChange={setTarget}
            />
          )}
        </div>
        <Button type="submit" disabled={name.trim() === ''} className="self-start">
          {t('settings.habits.add')}
        </Button>
      </form>

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogTitle>{t('settings.habits.deleteTitle', { name: toDelete?.name })}</DialogTitle>
          <DialogDescription>{t('settings.habits.deleteBody')}</DialogDescription>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button variant="secondary">{t('settings.habits.cancel')}</Button>
            </DialogClose>
            <Button variant="danger" onClick={() => toDelete && remove(toDelete)}>
              {t('settings.habits.deleteConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Tile>
  );
}
