import i18n from '../i18n';
import { now } from '../db/clock';
import type { ReminderSettings } from '../db/repos/settings';
import { PLATFORM } from './runtime';
import type { Platform } from './runtime';

export type ReminderKind = 'movement' | 'activeBreak' | 'water' | 'bedtime';
export type PermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface NotificationAdapter {
  /** `true` quando o agendamento vive fora do app (nativo): desmontar a tela não pode cancelá-lo. */
  persistent: boolean;
  requestPermission(): Promise<boolean>;
  getPermission(): Promise<PermissionStatus>;
  schedule(rules: ReminderSettings): Promise<void>;
  cancelAll(): Promise<void>;
}

type Kind = ReminderKind;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  // Limita o intervalo também aqui: um backup importado pode trazer valores fora de 30-240.
  const every = Math.min(240, Math.max(30, rule.everyMinutes));
  for (let m = start; m <= end; m += every) {
    const candidate = atMinutes(at, m);
    if (candidate > at) return candidate;
  }
  return atMinutes(new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1), start);
}

export interface TimerDeps {
  show(title: string, body: string): void;
  getPermission(): Promise<PermissionStatus>;
  requestPermission(): Promise<boolean>;
}

// Horários inválidos (ex.: vindos de um backup editado) não agendam nada.
export function nextFor(kind: Kind, rules: ReminderSettings, at: Date): Date | null {
  switch (kind) {
    case 'movement':
    case 'bedtime': {
      const r = rules[kind];
      return r.enabled && HHMM.test(r.time) ? nextFixedTime(r.time, at) : null;
    }
    case 'activeBreak':
    case 'water': {
      const r = rules[kind];
      return r.enabled && Number.isFinite(r.everyMinutes) && HHMM.test(r.from) && HHMM.test(r.to)
        ? nextIntervalTime(r, at)
        : null;
    }
  }
}

/** Lembretes por timers: só disparam com o app aberto; os timers morrem junto com ele. */
export function createTimerNotifications(deps: TimerDeps): NotificationAdapter {
  // Um timer por lembrete: o que já disparou é substituído, nunca acumulado.
  const timers = new Map<Kind, ReturnType<typeof setTimeout>>();

  const notify = (kind: Kind): void => {
    void deps
      .getPermission()
      .then((permission) => {
        if (permission !== 'granted') return;
        deps.show(
          i18n.t('reminders.notifications.title'),
          i18n.t(`reminders.notifications.${kind}`),
        );
      })
      .catch(() => {
        // sem como exibir: o lembrete é só perdido
      });
  };

  const arm = (kind: Kind, rules: ReminderSettings): void => {
    const at = now();
    // +1 s: um timer que dispara um pouco antes da hora não pode reagendar o mesmo horário.
    const next = nextFor(kind, rules, new Date(at.getTime() + 1000));
    if (!next) return;
    const delay = next.getTime() - at.getTime();
    if (!Number.isFinite(delay) || delay < 0) return;
    const timer = setTimeout(() => {
      // Reagenda antes de notificar: uma falha ao exibir não pode quebrar a cadeia.
      arm(kind, rules);
      notify(kind);
    }, delay);
    timers.set(kind, timer);
  };

  const clear = (): void => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };

  return {
    persistent: false,
    requestPermission: () => deps.requestPermission(),
    getPermission: () => deps.getPermission(),
    // Sem `await`: os timers ficam armados de forma síncrona.
    async schedule(rules) {
      clear();
      for (const kind of ['movement', 'activeBreak', 'water', 'bedtime'] as const) arm(kind, rules);
    },
    async cancelAll() {
      clear();
    },
  };
}

function showWeb(title: string, body: string): void {
  const options = { body, icon: '/icons/icon-192.png' };
  // `new Notification` lança "Illegal constructor" no Chrome para Android; lá só o service worker exibe.
  const fallback = () => {
    try {
      new Notification(title, options);
    } catch {
      // sem como exibir neste navegador: o lembrete é só perdido
    }
  };
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!sw) return fallback();
  sw.getRegistration()
    .then((registration) =>
      registration ? registration.showNotification(title, options) : fallback(),
    )
    .catch(fallback);
}

/** Na web os lembretes só disparam com a página aberta. */
export const webNotifications: NotificationAdapter = createTimerNotifications({
  show: showWeb,
  getPermission: async () =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  async requestPermission() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  },
});

// O plugin só é carregado no app nativo (como em `links.ts`); `persistent` precisa ser conhecido de imediato.
function lazyNative(
  persistent: boolean,
  load: () => Promise<NotificationAdapter>,
): NotificationAdapter {
  let loaded: Promise<NotificationAdapter> | undefined;
  const adapter = () =>
    (loaded ??= load().catch((e: unknown) => {
      loaded = undefined; // permite tentar o import de novo
      throw e;
    }));
  return {
    persistent,
    requestPermission: async () => (await adapter()).requestPermission(),
    getPermission: async () => (await adapter()).getPermission(),
    schedule: async (rules) => (await adapter()).schedule(rules),
    cancelAll: async () => (await adapter()).cancelAll(),
  };
}

const desktopLazy = lazyNative(
  false,
  async () => (await import('./notifications-tauri')).desktopNotifications,
);
const androidLazy = lazyNative(
  true,
  async () => (await import('./notifications-tauri')).androidNotifications,
);

export function getNotificationAdapter(platform: Platform = PLATFORM): NotificationAdapter {
  if (platform === 'android') return androidLazy;
  if (platform === 'desktop') return desktopLazy;
  return webNotifications;
}
