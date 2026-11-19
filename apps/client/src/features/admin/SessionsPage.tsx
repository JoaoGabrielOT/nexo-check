import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toLocalDateKey } from '@nexo/shared';
import { Alert, Button, Input, PageHeader, Tile, toast } from '@nexo/ui';
import { createSession, listSessions, type SessionView } from './adminApi';
import { useAdmin } from './AdminContext';
import { SessionCard } from './SessionCard';

const MAX_LOCATION = 80;

const pill =
  'flex min-h-11 cursor-pointer items-center rounded-full border-2 border-current px-5 py-2 text-sm font-extrabold ' +
  'peer-checked:border-transparent peer-checked:bg-navy peer-checked:text-[#f7f5f2] dark:peer-checked:bg-lav2 dark:peer-checked:text-navy ' +
  'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-solid peer-focus-visible:outline-bl';

function NewSessionForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const { token, expireOn401 } = useAdmin();
  const [workshop, setWorkshop] = useState<1 | 2>(1);
  const [date, setDate] = useState(() => toLocalDateKey(new Date()));
  const [location, setLocation] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const place = location.trim();
    if (busy || place.length === 0 || date.length === 0) return;
    setBusy(true);
    setError(false);
    try {
      await createSession(token, { workshop, date, location: place });
      setLocation('');
      toast(t('admin.sessions.created'));
      onCreated();
    } catch (err) {
      if (!expireOn401(err)) setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tile tone="plain" label={t('admin.sessions.newTitle')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-extrabold">{t('admin.sessions.workshop')}</legend>
          <div className="flex flex-wrap gap-2">
            {([1, 2] as const).map((n) => (
              <div key={n}>
                <input
                  id={`workshop-${n}`}
                  type="radio"
                  name="workshop"
                  className="peer sr-only"
                  checked={workshop === n}
                  onChange={() => setWorkshop(n)}
                />
                <label htmlFor={`workshop-${n}`} className={pill}>
                  {t('admin.sessions.workshopN', { n })}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="session-date" className="font-extrabold">
              {t('admin.sessions.date')}
            </label>
            <Input
              id="session-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="session-location" className="font-extrabold">
              {t('admin.sessions.location')}
            </label>
            <Input
              id="session-location"
              value={location}
              maxLength={MAX_LOCATION}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>
        </div>
        {error && <Alert role="alert">{t('admin.sessions.createFailed')}</Alert>}
        <Button type="submit" className="self-start" disabled={busy || location.trim() === ''}>
          {busy ? t('admin.sessions.creating') : t('admin.sessions.create')}
        </Button>
      </form>
    </Tile>
  );
}

export function SessionsPage() {
  const { t } = useTranslation();
  const { token, expireOn401 } = useAdmin();
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Muda a cada pedido de recarga (criar, salvar, excluir, tentar de novo).
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    listSessions(token).then(
      (list) => {
        if (!alive) return;
        setSessions(list);
        setFailed(false);
      },
      (e: unknown) => {
        if (alive && !expireOn401(e)) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [token, expireOn401, version]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.sessions.listTitle')} />
      <NewSessionForm onCreated={load} />
      {failed && (
        <Alert role="alert" className="flex flex-wrap items-center justify-between gap-3">
          {t('admin.sessions.loadFailed')}
          <Button variant="secondary" onClick={load}>
            {t('admin.sessions.retry')}
          </Button>
        </Alert>
      )}
      {sessions?.length === 0 && (
        <p className="max-w-prose text-muted">{t('admin.sessions.empty')}</p>
      )}
      {sessions && sessions.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
