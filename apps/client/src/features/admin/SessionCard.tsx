import { Copy, Minus, Plus, Presentation, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listMarkdown } from '@nexo/shared';
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
import { deleteSession, setManualCount, type SessionView } from './adminApi';
import { useAdmin } from './AdminContext';
import { QrImage } from './QrImage';

const MAX_MANUAL = 1000;

export const ddmm = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';
const stepButton = `grid size-11 cursor-pointer place-items-center rounded-full border-2 border-current disabled:opacity-40 ${focusRing}`;

interface ProjectionProps {
  session: SessionView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Projection({ session, open, onOpenChange }: ProjectionProps) {
  const { t } = useTranslation();
  const n = session.workshop;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-6 overflow-y-auto rounded-none! p-6 text-center">
        <DialogClose
          aria-label={t('admin.sessions.closeProjection')}
          className={`absolute top-4 right-4 grid size-11 cursor-pointer place-items-center rounded-full hover:bg-text/8 ${focusRing}`}
        >
          <X aria-hidden="true" className="size-6" />
        </DialogClose>
        <DialogTitle className="text-2xl sm:text-3xl">
          {t('admin.sessions.projectTitle', { n })} ({ddmm(session.date)})
        </DialogTitle>
        <p
          aria-label={t('admin.sessions.code')}
          className="font-mono text-[clamp(3rem,15vw,9rem)] leading-none font-extrabold tracking-[0.06em] tabular-nums"
        >
          {session.code}
        </p>
        <QrImage
          url={session.checkinUrl}
          alt={t('admin.sessions.qrAlt', { n, date: ddmm(session.date) })}
          className="w-[min(70vw,45vh)]"
        />
        <DialogDescription className="max-w-xl text-lg text-balance">
          {t('admin.sessions.projectHint')}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

export function SessionCard({
  session,
  onChanged,
}: {
  session: SessionView;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { token, expireOn401 } = useAdmin();
  const [projecting, setProjecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [manual, setManual] = useState(session.manualCount);
  const [busy, setBusy] = useState(false);
  const n = session.workshop;
  const title = listMarkdown('oficinas')[n - 1]?.meta.title ?? t('workshop.label', { n });
  const date = ddmm(session.date);
  const blocked = session.checkins > 0;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(session.checkinUrl);
      toast(t('admin.sessions.copied'));
    } catch {
      toast(t('admin.sessions.copyFailed'));
    }
  };

  const saveManual = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setManualCount(token, session.id, manual);
      toast(t('admin.sessions.saved'));
      onChanged();
    } catch (e) {
      if (!expireOn401(e)) toast(t('admin.sessions.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteSession(token, session.id);
      setConfirming(false);
      toast(t('admin.sessions.deleted'));
      onChanged();
    } catch (e) {
      setConfirming(false);
      if (!expireOn401(e)) {
        toast(t('admin.sessions.deleteFailed'));
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tile
      tone={n === 1 ? 'sleep' : 'breathing'}
      label={`${t('workshop.label', { n })} em ${date}`}
      className="gap-4"
    >
      <div>
        <h3 className="text-xl leading-snug font-extrabold tracking-[-0.02em] text-balance">
          {title}
        </h3>
        <p className="mt-1 font-semibold">
          {date} · {session.location}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <p
          aria-label={t('admin.sessions.code')}
          className="font-mono text-[clamp(2.75rem,12vw,4.5rem)] leading-none font-extrabold tracking-[0.06em] tabular-nums"
        >
          {session.code}
        </p>
        <QrImage
          url={session.checkinUrl}
          alt={t('admin.sessions.qrAlt', { n, date })}
          className="size-36"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setProjecting(true)}>
          <Presentation aria-hidden="true" className="size-4" />
          {t('admin.sessions.project')}
        </Button>
        <Button variant="secondary" onClick={() => void copyLink()}>
          <Copy aria-hidden="true" className="size-4" />
          {t('admin.sessions.copyLink')}
        </Button>
      </div>
      <p className="font-extrabold tabular-nums">
        {t('admin.sessions.checkins', { count: session.checkins })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`manual-${session.id}`} className="font-extrabold">
          {t('admin.sessions.manual')}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t('admin.sessions.manualMinus')}
            className={stepButton}
            disabled={manual <= 0}
            onClick={() => setManual((m) => Math.max(0, m - 1))}
          >
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <input
            id={`manual-${session.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_MANUAL}
            value={manual}
            onChange={(e) =>
              setManual(Math.min(MAX_MANUAL, Math.max(0, Math.floor(Number(e.target.value) || 0))))
            }
            className={`min-h-11 w-20 rounded-full border-2 border-current bg-transparent px-2 text-center font-extrabold tabular-nums ${focusRing}`}
          />
          <button
            type="button"
            aria-label={t('admin.sessions.manualPlus')}
            className={stepButton}
            disabled={manual >= MAX_MANUAL}
            onClick={() => setManual((m) => Math.min(MAX_MANUAL, m + 1))}
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        </div>
        <Button
          variant="secondary"
          disabled={busy || manual === session.manualCount}
          onClick={() => void saveManual()}
        >
          {t('admin.sessions.save')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-tile-ink/15 pt-3">
        <Button
          variant="danger"
          disabled={blocked}
          title={blocked ? t('admin.sessions.deleteBlocked') : undefined}
          aria-describedby={blocked ? `blocked-${session.id}` : undefined}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {t('admin.sessions.delete')}
        </Button>
        {blocked && (
          <p id={`blocked-${session.id}`} className="text-sm">
            {t('admin.sessions.deleteBlocked')}
          </p>
        )}
      </div>

      <Projection session={session} open={projecting} onOpenChange={setProjecting} />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle>{t('admin.sessions.delete')}</DialogTitle>
          <DialogDescription>{t('admin.sessions.deleteConfirm', { n, date })}</DialogDescription>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">{t('admin.sessions.deleteNo')}</Button>
            </DialogClose>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              {t('admin.sessions.deleteYes')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Tile>
  );
}
