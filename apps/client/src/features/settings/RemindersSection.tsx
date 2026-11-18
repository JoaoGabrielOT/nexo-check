import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Tile, toast } from '@nexo/ui';
import { getSettings, updateSettings } from '../../db';
import type { ReminderSettings } from '../../db';
import { NumberStepper } from './NumberStepper';
import { getNotificationAdapter, permissionState } from '../../platform/notifications';

type Kind = keyof ReminderSettings;
const KINDS: Kind[] = ['movement', 'activeBreak', 'water', 'bedtime'];
const INTERVAL = { min: 30, max: 240, step: 15 } as const; // minutos

const field =
  'min-h-11 rounded-control border-2 border-text/40 bg-surface px-3 text-sm font-bold text-text tabular-nums focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

/** Reagenda os lembretes (timers) sempre que as configurações mudam; cancela ao sair do app. */
export function useReminderScheduling(reminders: ReminderSettings | undefined): void {
  useEffect(() => {
    if (!reminders) return;
    const adapter = getNotificationAdapter();
    adapter.schedule(reminders);
    return () => adapter.cancelAll();
  }, [reminders]);
}

export function RemindersSection() {
  const { t } = useTranslation();
  const settings = useLiveQuery(getSettings, []);
  const [permission, setPermission] = useState(permissionState);
  const [windowError, setWindowError] = useState<Kind | null>(null);
  if (!settings) return null;
  const { reminders } = settings;

  // Lê as configurações no momento da escrita: dois toques seguidos não perdem o primeiro.
  const change = <K extends Kind>(kind: K, patch: Partial<ReminderSettings[K]>) =>
    getSettings()
      .then((current) => {
        const rule = { ...current.reminders[kind], ...patch };
        if ('to' in rule && 'from' in rule && rule.to <= rule.from) {
          setWindowError(kind);
          return;
        }
        setWindowError(null);
        return updateSettings({ reminders: { ...current.reminders, [kind]: rule } });
      })
      .catch(() => void toast(t('errors.generic')));

  // O pedido de permissão acontece ao ligar um lembrete (gesto da pessoa), enquanto ainda não foi decidido.
  const toggle = async (kind: Kind, enabled: boolean) => {
    if (enabled && permissionState() === 'default') {
      await getNotificationAdapter().requestPermission();
      setPermission(permissionState());
    }
    await change(kind, { enabled });
  };

  return (
    <Tile tone="plain" label={t('reminders.title')}>
      <p className="max-w-prose text-sm text-muted">{t('reminders.limitation')}</p>
      {permission === 'denied' && (
        <p role="status" className="max-w-prose text-sm font-bold">
          {t('reminders.denied')}
        </p>
      )}
      {permission === 'unsupported' && (
        <p role="status" className="max-w-prose text-sm font-bold">
          {t('reminders.unsupported')}
        </p>
      )}
      <ul className="flex flex-col">
        {KINDS.map((kind) => {
          const rule = reminders[kind];
          const name = t(`reminders.${kind}`);
          return (
            <li
              key={kind}
              className="flex flex-col gap-3 border-t border-text/12 py-4 first:border-t-0"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-extrabold">{name}</p>
                <Switch
                  checked={rule.enabled}
                  aria-label={t('reminders.enable', { name })}
                  onCheckedChange={(enabled) => void toggle(kind, enabled)}
                />
              </div>
              {windowError === kind && (
                <p role="alert" className="text-sm font-bold">
                  {t('reminders.windowError')}
                </p>
              )}
              {rule.enabled && (
                <div className="flex flex-wrap items-center gap-3">
                  {'time' in rule ? (
                    <input
                      type="time"
                      className={field}
                      aria-label={t('reminders.time', { name })}
                      value={rule.time}
                      onChange={(e) =>
                        e.target.value && void change(kind as 'movement', { time: e.target.value })
                      }
                    />
                  ) : (
                    <>
                      <NumberStepper
                        label={t('reminders.every', { name })}
                        value={rule.everyMinutes}
                        {...INTERVAL}
                        format={(n) => t('reminders.minutes', { n })}
                        onChange={(everyMinutes) => void change(kind as 'water', { everyMinutes })}
                      />
                      <input
                        type="time"
                        className={field}
                        aria-label={t('reminders.from', { name })}
                        value={rule.from}
                        onChange={(e) =>
                          e.target.value && void change(kind as 'water', { from: e.target.value })
                        }
                      />
                      <input
                        type="time"
                        className={field}
                        aria-label={t('reminders.to', { name })}
                        value={rule.to}
                        onChange={(e) =>
                          e.target.value && void change(kind as 'water', { to: e.target.value })
                        }
                      />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}
