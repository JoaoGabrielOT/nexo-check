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
});
