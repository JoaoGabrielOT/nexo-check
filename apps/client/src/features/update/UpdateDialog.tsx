import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';
import { dismissUpdate, installUpdate, useUpdaterState } from '../../platform/updater/store';

export function UpdateDialog() {
  const { t } = useTranslation();
  const state = useUpdaterState();
  const statusRef = useRef<HTMLDivElement>(null);
  const downloading = state.status === 'downloading';

  // Os botões somem quando o download começa: o foco vai para a região de status.
  useEffect(() => {
    if (downloading) statusRef.current?.focus();
  }, [downloading]);

  if (state.status === 'idle') return null;
  const { info } = state;
  const percent =
    state.status === 'downloading' && state.progress.total
      ? Math.min(100, Math.round((state.progress.downloaded / state.progress.total) * 100))
      : null;
  const downloadingText =
    percent === null ? t('update.downloadingUnknown') : t('update.downloading', { percent });
  const statusText =
    state.status === 'downloading'
      ? downloadingText
      : state.status === 'needs_permission'
        ? t('update.needsPermission')
        : state.status === 'ready'
          ? t('update.ready')
          : '';

  return (
    <Dialog open onOpenChange={(open) => !open && dismissUpdate()}>
      <DialogContent>
        <DialogTitle>{t('update.title', { version: info.version })}</DialogTitle>
        <DialogDescription>{t('update.notes')}</DialogDescription>
        {info.notes.trim() && (
          <MarkdownView body={info.notes} className="mt-2 max-h-60 overflow-y-auto text-sm" />
        )}
        {downloading && (
          <div
            role="progressbar"
            aria-label={t('update.progressLabel')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={downloadingText}
            className="mt-4 h-3 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full bg-bl transition-[width]"
              style={{ width: `${percent ?? 100}%`, opacity: percent === null ? 0.4 : 1 }}
            />
          </div>
        )}
        <div
          ref={statusRef}
          tabIndex={-1}
          aria-live="polite"
          className="mt-2 text-sm font-extrabold outline-none"
        >
          {statusText}
        </div>
        {state.status === 'error' && (
          <p role="alert" className="mt-4 text-sm font-extrabold">
            {t('update.error')}
          </p>
        )}
        {!downloading && (
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={dismissUpdate}>
              {t('update.later')}
            </Button>
            <Button onClick={() => void installUpdate()}>
              {state.status === 'ready' ? t('update.installNow') : t('update.now')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
