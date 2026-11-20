import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REMINDERS } from '../../src/db';
import type { NotificationAdapter } from '../../src/platform/notifications';

const adapter = vi.hoisted(() => ({ current: null as unknown as NotificationAdapter }));

vi.mock('../../src/platform/notifications', async (importActual) => ({
  ...(await importActual<typeof import('../../src/platform/notifications')>()),
  getNotificationAdapter: () => adapter.current,
}));

import { useReminderScheduling } from '../../src/features/settings/RemindersSection';

const make = (persistent: boolean): NotificationAdapter => ({
  persistent,
  requestPermission: vi.fn(async () => true),
  getPermission: vi.fn(async () => 'granted' as const),
  schedule: vi.fn(async () => undefined),
  cancelAll: vi.fn(async () => undefined),
});

beforeEach(() => vi.clearAllMocks());

const rules = (time: string) => ({ ...DEFAULT_REMINDERS, movement: { enabled: true, time } });

describe('useReminderScheduling', () => {
  it('agenda ao montar e, com adaptador persistente, não cancela ao desmontar', () => {
    adapter.current = make(true);
    const { unmount } = renderHook(() => useReminderScheduling(DEFAULT_REMINDERS));
    expect(adapter.current.schedule).toHaveBeenCalledWith(DEFAULT_REMINDERS);
    unmount();
    expect(adapter.current.cancelAll).not.toHaveBeenCalled();
  });

  it('com adaptador não persistente cancela ao desmontar', () => {
    adapter.current = make(false);
    const { unmount } = renderHook(() => useReminderScheduling(DEFAULT_REMINDERS));
    unmount();
    expect(adapter.current.cancelAll).toHaveBeenCalledTimes(1);
  });

  it('reagenda ao voltar o foco (visibilitychange visível e focus)', () => {
    adapter.current = make(true);
    renderHook(() => useReminderScheduling(DEFAULT_REMINDERS));
    expect(adapter.current.schedule).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    expect(adapter.current.schedule).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(adapter.current.schedule).toHaveBeenCalledTimes(3);
  });

  it('não reagenda quando só a identidade do objeto muda, só quando o conteúdo muda', () => {
    adapter.current = make(true);
    const { rerender } = renderHook(({ r }) => useReminderScheduling(r), {
      initialProps: { r: rules('08:00') },
    });
    rerender({ r: rules('08:00') });
    expect(adapter.current.schedule).toHaveBeenCalledTimes(1);
    rerender({ r: rules('09:00') });
    expect(adapter.current.schedule).toHaveBeenCalledTimes(2);
  });

  it('falha ao agendar ou cancelar não gera rejeição não tratada', async () => {
    adapter.current = make(false);
    vi.mocked(adapter.current.schedule).mockRejectedValue(new Error('x'));
    vi.mocked(adapter.current.cancelAll).mockRejectedValue(new Error('y'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useReminderScheduling(DEFAULT_REMINDERS));
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    warn.mockRestore();
  });
});
