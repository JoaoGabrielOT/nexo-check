import i18n from '../i18n';
import { now } from '../db/clock';
import type { ReminderSettings } from '../db/repos/settings';

export interface NotificationAdapter {
  requestPermission(): Promise<boolean>;
  schedule(rules: ReminderSettings): void;
  cancelAll(): void;
}

type Kind = 'movement' | 'activeBreak' | 'water' | 'bedtime';

const toMinutes = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const atMinutes = (base: Date, minutes: number): Date => {
  const d = new Date(base);
  d.setHours(0, minutes, 0, 0);
  return d;
};

/** Próximo horário fixo (hoje, se ainda não passou; senão amanhã). */
export function nextFixedTime(time: string, from: Date): Date {
  const today = atMinutes(from, toMinutes(time));
  if (today > from) return today;
  return atMinutes(
    new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1),
    toMinutes(time),
  );
}

/** Próximo disparo de um intervalo dentro da janela `from`–`to`; fora da janela, o início do próximo dia. */
export function nextIntervalTime(
  rule: { everyMinutes: number; from: string; to: string },
  at: Date,
): Date {
  const start = toMinutes(rule.from);
  const end = toMinutes(rule.to);
  const every = Math.max(1, rule.everyMinutes);
  for (let m = start; m <= end; m += every) {
    const candidate = atMinutes(at, m);
    if (candidate > at) return candidate;
  }
  return atMinutes(new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1), start);
}

export function permissionState(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

function notify(kind: Kind): void {
  if (permissionState() !== 'granted') return;
  new Notification(i18n.t('reminders.notifications.title'), {
    body: i18n.t(`reminders.notifications.${kind}`),
    icon: '/icons/icon-192.png',
  });
}

let timers: ReturnType<typeof setTimeout>[] = [];

function nextFor(kind: Kind, rules: ReminderSettings, at: Date): Date | null {
  switch (kind) {
    case 'movement':
    case 'bedtime': {
      const r = rules[kind];
      return r.enabled ? nextFixedTime(r.time, at) : null;
    }
    case 'activeBreak':
    case 'water': {
      const r = rules[kind];
      return r.enabled ? nextIntervalTime(r, at) : null;
    }
  }
}

function arm(kind: Kind, rules: ReminderSettings): void {
  const at = now();
  // +1 s: um timer que dispara um pouco antes da hora não pode reagendar o mesmo horário.
  const next = nextFor(kind, rules, new Date(at.getTime() + 1000));
  if (!next) return;
  const timer = setTimeout(() => {
    notify(kind);
    arm(kind, rules);
  }, next.getTime() - at.getTime());
  timers.push(timer);
}

/** Na web os lembretes só disparam com a página aberta; os timers morrem junto com ela. */
export const webNotifications: NotificationAdapter = {
  async requestPermission() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  },
  schedule(rules) {
    webNotifications.cancelAll();
    for (const kind of ['movement', 'activeBreak', 'water', 'bedtime'] as const) arm(kind, rules);
  },
  cancelAll() {
    for (const t of timers) clearTimeout(t);
    timers = [];
  },
};

// Na Fase B ganha o adaptador Tauri (agendamento nativo).
export function getNotificationAdapter(): NotificationAdapter {
  return webNotifications;
}
