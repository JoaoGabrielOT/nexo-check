import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
} from '@nexo/ui';
import { RestoreBlockedError, restoreFromServer } from '../../sync/engine';
import { ApiError } from '../../sync/http';

export interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de baixar os dados com sucesso. */
  onRestored: () => void | Promise<void>;
}

/** Código + chave do aparelho anterior; valida com o servidor e baixa os registros. */
export function RestoreDialog({ open, onOpenChange, onRestored }: RestoreDialogProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      await restoreFromServer(code, key);
      await onRestored();
      onOpenChange(false);
      setCode('');
      setKey('');
    } catch (e) {
      if (e instanceof RestoreBlockedError) setError(t('settings.sync.restoreBlocked'));
      else if (e instanceof ApiError && (e.status === 401 || e.status === 400)) {
        setError(t('settings.sync.restoreInvalid'));
      } else setError(t('settings.sync.restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent>
        <DialogTitle>{t('settings.sync.restoreTitle')}</DialogTitle>
        <DialogDescription>{t('settings.sync.restoreBody')}</DialogDescription>
        <form
          noValidate
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void restore();
          }}
        >
          <label htmlFor="restore-code" className="text-sm font-extrabold">
            {t('settings.sync.restoreCode')}
          </label>
          <Input
            id="restore-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="NEXO-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono tracking-wider uppercase"
          />
          <label htmlFor="restore-key" className="text-sm font-extrabold">
            {t('settings.sync.restoreKey')}
          </label>
          <Input
            id="restore-key"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="font-mono tracking-wider uppercase"
          />
          {error && (
            <p role="alert" className="text-sm font-extrabold">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('settings.sync.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || !code.trim() || !key.trim()}>
              {busy ? t('settings.sync.restoring') : t('settings.sync.restoreConfirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
