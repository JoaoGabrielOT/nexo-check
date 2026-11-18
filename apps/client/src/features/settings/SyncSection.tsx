import { Copy, Eye, EyeOff } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tile, toast } from '@nexo/ui';
import { getSettings } from '../../db';

const iconBtn =
  'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-text transition-colors hover:bg-text/8 ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

// Estrutura apenas: as ações (sincronizar, restaurar, revogar) são ligadas na Task 20.
export function SyncSection() {
  const { t } = useTranslation();
  const settings = useLiveQuery(getSettings, []);
  const [showKey, setShowKey] = useState(false);
  if (!settings) return null;
  const participant = settings.participant;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast(t('settings.sync.copied')),
      () => toast(t('errors.generic')),
    );
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
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled>
          {t('settings.sync.now')}
        </Button>
        <Button variant="secondary" disabled>
          {t('settings.sync.restore')}
        </Button>
        <Button variant="secondary" disabled>
          {t('settings.sync.revoke')}
        </Button>
      </div>
      <p className="max-w-prose text-sm text-muted">{t('settings.sync.soon')}</p>
    </Tile>
  );
}
