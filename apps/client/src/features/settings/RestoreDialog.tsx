import { useRef, useState } from 'react';
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
import {
  RestoreBlockedError,
  RestoreNeedsConfirmError,
  restoreFromServer,
} from '../../sync/engine';
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
  // Há dados locais ou outra conta cadastrada: a pessoa escolhe apagar tudo e restaurar, ou cancelar.
  const [confirming, setConfirming] = useState(false);

  // Fechar por qualquer caminho (Cancelar, Esc, fora) volta ao passo inicial, sem restos.
  // Cada fechamento invalida a restauração em andamento: ela não pode mexer no diálogo depois.
  const attempt = useRef(0);
  const close = () => {
    attempt.current += 1;
    setBusy(false);
    onOpenChange(false);
    setError(null);
    setConfirming(false);
    setCode('');
    setKey('');
  };

  const restore = async (replaceLocal = false) => {
    const mine = ++attempt.current;
    const stale = () => attempt.current !== mine;
    setBusy(true);
    setError(null);
    try {
      await restoreFromServer(code, key, { replaceLocal });
      await onRestored();
      if (stale()) return;
      onOpenChange(false);
      setCode('');
      setKey('');
      setConfirming(false);
    } catch (e) {
      if (stale()) return;
      if (e instanceof RestoreNeedsConfirmError) setConfirming(true);
      else if (e instanceof RestoreBlockedError) setError(t('settings.sync.restoreBlocked'));
      else if (e instanceof ApiError && (e.status === 401 || e.status === 400)) {
        setError(t('settings.sync.restoreInvalid'));
      } else setError(t('settings.sync.restoreFailed'));
    } finally {
      if (!stale()) setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        {confirming ? (
          <>
            <DialogTitle>{t('settings.sync.restoreReplaceTitle')}</DialogTitle>
            <DialogDescription>{t('settings.sync.restoreReplaceBody')}</DialogDescription>
            {error && (
              <p role="alert" className="mt-3 text-sm font-extrabold">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" disabled={busy} onClick={close}>
                {t('settings.sync.cancel')}
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void restore(true)}>
                {busy ? t('settings.sync.restoring') : t('settings.sync.restoreReplaceConfirm')}
              </Button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
