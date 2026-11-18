import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toLocalDateKey } from '@nexo/shared';
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
import { BackupError, exportAll, getSettings, importAll, wipeLocal } from '../../db';
import { now } from '../../db/clock';
import { backupFileSchema } from '../../db/schemas';
import { downloadFile, pickFile } from '../../platform/files';
import { buildRecordsCsv } from './recordsCsv';

export interface DataSectionProps {
  /** Apaga os dados do participante no servidor; a Task 20 injeta a chamada real. */
  deleteRemote?: () => Promise<void>;
}

type Pending = null | 'import' | 'wipe' | 'remoteFail';

export function DataSection({ deleteRemote }: DataSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const settings = useLiveQuery(getSettings, []);
  const [pending, setPending] = useState<Pending>(null);
  const [file, setFile] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const registered = settings?.participant?.registered === true;

  const remove: () => Promise<void> =
    deleteRemote ??
    (async () => {
      throw new Error(t('settings.data.syncUnavailable'));
    });

  const stamp = () => toLocalDateKey(now());
  const report = () => toast(t('errors.generic'));

  const exportJson = () =>
    exportAll()
      .then((backup) =>
        downloadFile(
          `nexo-check-backup-${stamp()}.json`,
          JSON.stringify(backup, null, 2),
          'application/json',
        ),
      )
      .catch(report);

  const exportCsv = () =>
    exportAll()
      .then((backup) =>
        downloadFile(
          `nexo-check-registros-${stamp()}.csv`,
          buildRecordsCsv(backup.data),
          'text/csv;charset=utf-8',
        ),
      )
      .catch(report);

  const chooseFile = async () => {
    setError(null);
    const text = await pickFile('application/json,.json');
    if (text === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    // Valida antes de pedir confirmação: arquivo inválido nem chega ao diálogo.
    if (!backupFileSchema.safeParse(parsed).success) {
      setError(t('errors.backup.invalid'));
      return;
    }
    setFile(parsed);
    setPending('import');
  };

  const confirmImport = async () => {
    setPending(null);
    try {
      await importAll(file);
      toast(t('settings.data.imported'));
    } catch (e) {
      setError(e instanceof BackupError ? t(e.messageKey) : t('errors.generic'));
    }
    setFile(null);
  };

  const wipeAndLeave = async () => {
    setPending(null);
    try {
      await wipeLocal();
      navigate('/onboarding', { replace: true });
    } catch {
      report();
    }
  };

  const confirmWipe = async () => {
    try {
      // Lê no momento do clique: o valor da consulta ao vivo pode ainda não ter carregado.
      if ((await getSettings()).participant?.registered) {
        try {
          await remove();
        } catch {
          setPending('remoteFail');
          return;
        }
      }
    } catch {
      setPending(null);
      report();
      return;
    }
    await wipeAndLeave();
  };

  return (
    <Tile tone="plain" label={t('settings.data.title')}>
      <p className="max-w-prose text-sm text-muted">{t('settings.data.warning')}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => void exportJson()}>
          {t('settings.data.exportJson')}
        </Button>
        <Button variant="secondary" onClick={() => void exportCsv()}>
          {t('settings.data.exportCsv')}
        </Button>
        <Button variant="secondary" onClick={() => void chooseFile()}>
          {t('settings.data.import')}
        </Button>
      </div>
      <p className="max-w-prose text-sm text-muted">{t('settings.data.csvHint')}</p>
      {error && (
        <p role="alert" className="max-w-prose text-sm font-bold">
          {error}
        </p>
      )}
      <div className="mt-2 border-t border-text/12 pt-5">
        <Button variant="danger" onClick={() => setPending('wipe')}>
          {t('settings.data.wipe')}
        </Button>
      </div>

      <Dialog open={pending === 'import'} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogTitle>{t('settings.data.importTitle')}</DialogTitle>
          <DialogDescription>{t('settings.data.importBody')}</DialogDescription>
          <p className="mt-2 text-muted">{t('settings.data.importSync')}</p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button variant="secondary">{t('settings.data.cancel')}</Button>
            </DialogClose>
            <Button variant="danger" onClick={() => void confirmImport()}>
              {t('settings.data.importConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pending === 'wipe'} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogTitle>{t('settings.data.wipeTitle')}</DialogTitle>
          <DialogDescription>
            {t('settings.data.wipeBody')} {registered && t('settings.data.wipeRemote')}
          </DialogDescription>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button variant="secondary">{t('settings.data.cancel')}</Button>
            </DialogClose>
            <Button variant="danger" onClick={() => void confirmWipe()}>
              {t('settings.data.wipeConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pending === 'remoteFail'} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogTitle>{t('settings.data.remoteFailTitle')}</DialogTitle>
          <DialogDescription>{t('settings.data.remoteFailBody')}</DialogDescription>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button variant="secondary">{t('settings.data.cancel')}</Button>
            </DialogClose>
            <Button variant="danger" onClick={() => void wipeAndLeave()}>
              {t('settings.data.wipeLocalOnly')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Tile>
  );
}
