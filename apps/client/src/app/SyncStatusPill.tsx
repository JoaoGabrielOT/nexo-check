import { Check, Clock, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@nexo/ui';
import { useSyncStatus } from '../sync/useSyncStatus';

const icons: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  synced: Check,
  syncing: RefreshCw,
  pending: Clock,
  offline: CloudOff,
  error: TriangleAlert,
};

/** Indicador discreto da sincronização; some quando ela está desligada (sem consentimento). */
export function SyncStatusPill({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { state, pending } = useSyncStatus();
  if (state === 'disabled') return null;
  const kind = state === 'idle' ? (pending > 0 ? 'pending' : 'synced') : state;
  const Icon = icons[kind] ?? Check;
  return (
    <span
      role="status"
      aria-live="polite"
      data-sync-state={kind}
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full bg-text/8 px-3 text-xs font-bold text-text',
        kind === 'error' && 'bg-transparent ring-2 ring-current ring-inset',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-3.5', kind === 'syncing' && 'motion-safe:animate-spin')}
        strokeWidth={2.75}
      />
      {t(`sync.status.${kind}`, { count: pending })}
    </span>
  );
}
