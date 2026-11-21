import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';
import { dismissUpdate, installUpdate, useUpdaterState } from '../../platform/updater/store';

export function UpdateDialog() {
  const { t } = useTranslation();
  const state = useUpdaterState();
  if (state.status === 'idle') return null;
  const { info } = state;
  const downloading = state.status === 'downloading';
  const percent =
    downloading && state.progress.total
      ? Math.min(100, Math.round((state.progress.downloaded / state.progress.total) * 100))
      : null;

  return (
    <Dialog open onOpenChange={(open) => !open && dismissUpdate()}>
      <DialogContent>
        <DialogTitle>{t('update.title', { version: info.version })}</DialogTitle>
        <DialogDescription>{t('update.notes')}</DialogDescription>
        {info.notes.trim() && (
          <MarkdownView body={info.notes} className="mt-2 max-h-60 overflow-y-auto text-sm" />
        )}
        {downloading && (
          <div className="mt-4">
            <div
              role="progressbar"
              aria-label={t('update.progressLabel')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              className="h-3 overflow-hidden rounded-full bg-border"
            >
              <div
                className="h-full bg-bl transition-[width]"
                style={{ width: `${percent ?? 100}%`, opacity: percent === null ? 0.4 : 1 }}
              />
            </div>
            <p className="mt-2 text-sm font-extrabold">
              {percent === null
                ? t('update.downloadingUnknown')
                : t('update.downloading', { percent })}
            </p>
          </div>
        )}
        {state.status === 'needs_permission' && (
          <p role="status" className="mt-4 text-sm font-extrabold">
            {t('update.needsPermission')}
          </p>
        )}
        {state.status === 'ready' && (
          <p role="status" className="mt-4 text-sm font-extrabold">
            {t('update.ready')}
          </p>
        )}
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
