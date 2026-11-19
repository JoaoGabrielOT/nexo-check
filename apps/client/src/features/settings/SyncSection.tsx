import { Copy, Eye, EyeOff } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CONSENT_VERSION } from '@nexo/shared';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Tile,
  toast,
} from '@nexo/ui';
import { getSettings } from '../../db';
import { revokeConsent, syncNow } from '../../sync/engine';
import { RestoreDialog } from './RestoreDialog';
import { useSyncStatus } from '../../sync/useSyncStatus';

const iconBtn =
  'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-text transition-colors hover:bg-text/8 ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

type Dialogs = null | 'restore' | 'revoke';

export function SyncSection() {
  const { t } = useTranslation();
  const settings = useLiveQuery(getSettings, []);
  const status = useSyncStatus();
  const [showKey, setShowKey] = useState(false);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (!settings) return null;
  const participant = settings.participant;
  const enabled = settings.consent?.granted === true && settings.consent.version >= CONSENT_VERSION;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast(t('settings.sync.copied')),
      () => toast(t('errors.generic')),
    );
  };

  const syncMessage = (): string | null => {
    if (status.state === 'error' && status.error) return t(`settings.sync.errors.${status.error}`);
    if (status.state === 'offline') return t('settings.sync.offlineNow');
    return null;
  };
  const message = syncMessage() ?? notice;

  const runSync = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await syncNow();
      if (result === 'synced') toast(t('settings.sync.done'));
    } catch {
      setNotice(t('settings.sync.failed'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (alsoDelete: boolean) => {
    setBusy(true);
    setDialog(null);
    try {
      await revokeConsent({ deleteRemote: alsoDelete });
      toast(t('settings.sync.revoked'));
    } catch {
      // O consentimento já foi revogado; só a exclusão no servidor pode ter falhado.
      if ((await getSettings()).consent === null) setNotice(t('settings.sync.revokedDeleteFailed'));
      else toast(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tile tone="plain" label={t('settings.sync.title')}>
      <p className="max-w-prose text-sm font-semibold">
        {participant?.registered ? t('settings.sync.registered') : t('settings.sync.notRegistered')}
      </p>
      {participant && (
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-sm font-bold text-muted">{t('settings.sync.code')}</dt>
            <dd className="flex items-center gap-2">
              <code className="font-mono text-lg font-bold tracking-wider">{participant.code}</code>
              <button
                type="button"
                className={iconBtn}
                aria-label={t('settings.sync.copyCode')}
                onClick={() => copy(participant.code)}
              >
                <Copy aria-hidden="true" className="size-5" />
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-muted">{t('settings.sync.key')}</dt>
            <dd className="flex items-center gap-2">
              <code className="min-w-0 font-mono text-lg font-bold tracking-wider break-all">
                {showKey ? participant.key : '••••••••••••••••••••••••'}
              </code>
              <button
                type="button"
                className={iconBtn}
                aria-label={showKey ? t('settings.sync.hide') : t('settings.sync.show')}
                aria-pressed={showKey}
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? (
                  <EyeOff aria-hidden="true" className="size-5" />
                ) : (
                  <Eye aria-hidden="true" className="size-5" />
                )}
              </button>
              <button
                type="button"
                className={iconBtn}
                aria-label={t('settings.sync.copyKey')}
                onClick={() => copy(participant.key)}
              >
                <Copy aria-hidden="true" className="size-5" />
              </button>
            </dd>
          </div>
        </dl>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          {status.lastSyncAt
            ? t('settings.sync.lastSync', {
                when: new Date(status.lastSyncAt).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }),
              })
            : t('settings.sync.never')}
        </p>
        {!enabled && <p className="text-sm font-semibold">{t('settings.sync.needConsent')}</p>}
        {message && (
          <p role="alert" className="max-w-prose text-sm font-bold">
            {message}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={!enabled || busy || status.state === 'syncing'}
          onClick={() => void runSync()}
        >
          {t('settings.sync.now')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setDialog('restore')}>
          {t('settings.sync.restore')}
        </Button>
        <Button variant="secondary" disabled={!enabled || busy} onClick={() => setDialog('revoke')}>
          {t('settings.sync.revoke')}
        </Button>
      </div>

      <RestoreDialog
        open={dialog === 'restore'}
        onOpenChange={(open) => !open && setDialog(null)}
        onRestored={() => void toast(t('settings.sync.restored'))}
      />

      <Dialog open={dialog === 'revoke'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogTitle>{t('settings.sync.revokeTitle')}</DialogTitle>
          <DialogDescription>
            {t('settings.sync.revokeBody')}
            {participant?.registered && ` ${t('settings.sync.revokeAsk')}`}
          </DialogDescription>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button variant="secondary">{t('settings.sync.cancel')}</Button>
            </DialogClose>
            {participant?.registered ? (
              <>
                <Button variant="secondary" onClick={() => void revoke(false)}>
                  {t('settings.sync.revokeKeep')}
                </Button>
                <Button variant="danger" onClick={() => void revoke(true)}>
                  {t('settings.sync.revokeDelete')}
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => void revoke(false)}>
                {t('settings.sync.revokeOnly')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Tile>
  );
}
