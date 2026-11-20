import {
  Importance,
  Schedule,
  cancel,
  createChannel,
  isPermissionGranted,
  pending,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import i18n from '../i18n';
import type { ReminderSettings } from '../db/repos/settings';
import { createTimerNotifications } from './notifications';
import type { NotificationAdapter, PermissionStatus, ReminderKind } from './notifications';

const KINDS: ReminderKind[] = ['movement', 'activeBreak', 'water', 'bedtime'];
/** Cada lembrete ocupa uma faixa de 1000 ids; só ids dentro delas são cancelados (o resto não é nosso). */
export const REMINDER_ID_BASE: Record<ReminderKind, number> = {
  movement: 1000,
  activeBreak: 2000,
  water: 3000,
  bedtime: 4000,
};
const CHANNEL_ID = 'reminders';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ReminderSlot {
  id: number;
  kind: ReminderKind;
  hour: number;
  minute: number;
}

const toMinutes = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Um horário fixo por slot; os intervalos viram uma lista de horários dentro da janela. */
export function reminderSlots(rules: ReminderSettings): ReminderSlot[] {
  const slots: ReminderSlot[] = [];
  for (const kind of KINDS) {
    const base = REMINDER_ID_BASE[kind];
    const add = (minutes: number) =>
      slots.push({
        id: base + slots.filter((s) => s.kind === kind).length,
        kind,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
      });
    if (kind === 'movement' || kind === 'bedtime') {
      const r = rules[kind];
      if (r.enabled && HHMM.test(r.time)) add(toMinutes(r.time));
    } else {
      const r = rules[kind];
      if (!r.enabled || !Number.isFinite(r.everyMinutes) || !HHMM.test(r.from) || !HHMM.test(r.to))
        continue;
      // Limita o intervalo também aqui: um backup importado pode trazer valores fora de 30-240.
      const every = Math.min(240, Math.max(30, r.everyMinutes));
      for (let m = toMinutes(r.from); m <= toMinutes(r.to); m += every) add(m);
    }
  }
  return slots;
}

// No WebView `Notification.permission` fica em 'default' mesmo depois da recusa; guardamos o último pedido.
let lastDenied = false;

async function getPermission(): Promise<PermissionStatus> {
  if (await isPermissionGranted()) {
    lastDenied = false;
    return 'granted';
  }
  return lastDenied ? 'denied' : 'default';
}

const askPermission = async (): Promise<boolean> => {
  const result = await requestPermission();
  lastDenied = result === 'denied';
  return result === 'granted';
};

/** Windows: o plugin ignora o agendamento, então os timers do app disparam a notificação nativa. */
export const desktopNotifications: NotificationAdapter = createTimerNotifications({
  show: (title, body) => sendNotification({ title, body }),
  getPermission,
  requestPermission: askPermission,
});

async function cancelOurs(): Promise<void> {
  const ids = (await pending())
    .map((p) => p.id)
    .filter((id) => Object.values(REMINDER_ID_BASE).some((base) => id >= base && id < base + 1000));
  if (ids.length > 0) await cancel(ids);
}

// Chamadas seguidas (ex.: StrictMode) rodam uma depois da outra, senão duas cancelações intercaladas duplicariam.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task);
  // Se pending()/cancel() falharem, o próximo schedule (e o retorno do foco) cancela de novo as faixas.
  queue = run.catch(() => {
    console.warn('lembretes: falha ao atualizar o agendamento nativo');
  });
  return run;
};

/** Android: o agendamento é do sistema (repete todo dia, sobrevive ao app fechado e ao reboot). */
export const androidNotifications: NotificationAdapter = {
  persistent: true,
  requestPermission: askPermission,
  getPermission,
  schedule: (rules) =>
    serial(async () => {
      await cancelOurs();
      if ((await getPermission()) !== 'granted') return;
      await createChannel({
        id: CHANNEL_ID,
        name: i18n.t('reminders.title'),
        importance: Importance.Default,
      });
      for (const slot of reminderSlots(rules)) {
        sendNotification({
          id: slot.id,
          channelId: CHANNEL_ID,
          title: i18n.t('reminders.notifications.title'),
          body: i18n.t(`reminders.notifications.${slot.kind}`),
          schedule: Schedule.interval({ hour: slot.hour, minute: slot.minute }, true),
        });
      }
    }),
  cancelAll: () => serial(cancelOurs),
};
