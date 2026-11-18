import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { normalizeCode } from '@nexo/shared';
import { Button, Tile, buttonVariants, cn } from '@nexo/ui';
import { DuplicateCheckinError, addCheckin, db, getSettings } from '../../db';
import type { LocalCheckin } from '../../db/schemas';
import { requestSync } from '../../sync/engine';
import { SESSION_CODE_PATTERN, SESSION_CODE_RE } from './helpers';

const clean = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 6);

const chip = 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold';

function StatusChip({ status }: { status: LocalCheckin['status'] }) {
  const { t } = useTranslation();
  if (status === 'confirmed')
    return (
      <span className={cn(chip, 'bg-navy text-[#f7f5f2] dark:bg-peach dark:text-navy')}>
        {t('checkin.statusConfirmed')}
      </span>
    );
  if (status === 'rejected')
    return (
      <span className={cn(chip, 'border-2 border-current')}>{t('checkin.statusRejected')}</span>
    );
  return <span className={cn(chip, 'bg-tile-ink/12')}>{t('checkin.statusPending')}</span>;
}

function CheckinList({ items }: { items: LocalCheckin[] }) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="text-base font-extrabold">{t('checkin.history')}</h3>
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari: lista sem marcador */}
      <ul role="list" className="mt-1 divide-y divide-tile-ink/15">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="font-mono text-base font-extrabold tracking-widest">
              {c.sessionCode}
            </span>
            <StatusChip status={c.status} />
            {c.status === 'pending' && <span className="text-sm">{t('checkin.pendingHint')}</span>}
            {c.status === 'rejected' && c.reason && (
              <span className="text-sm">{t(`checkin.reason_${c.reason}`)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Código de sessão da oficina + lista de check-ins. Sem consentimento, nada é gravado. */
export function CheckinTile({ initialCode = '' }: { initialCode?: string }) {
  const { t } = useTranslation();
  const settings = useLiveQuery(() => getSettings(), []);
  const items = useLiveQuery(
    async () =>
      (await db.checkins.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [],
  );
  const [code, setCode] = useState(() => clean(initialCode));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const location = useLocation();
  // Depois do consentimento o app volta para esta mesma tela, com o código do QR na URL.
  const consentTo = `/onboarding/consentimento?next=${encodeURIComponent(location.pathname + location.search)}`;

  const consented = settings?.consent?.granted === true;

  const confirm = async () => {
    // Toque duplo: só uma gravação por vez (e o banco recusa o código repetido de qualquer forma).
    if (inFlight.current || items === undefined) return;
    inFlight.current = true;
    try {
      // Confere o consentimento na hora de gravar, não só na hora de desenhar a tela.
      if (!(await getSettings()).consent?.granted) return;
      const normalized = normalizeCode(code);
      if (!SESSION_CODE_RE.test(normalized)) {
        setError(t('checkin.invalidCode'));
        return;
      }
      await addCheckin(normalized);
      void requestSync().catch(() => undefined);
      setCode('');
      setSaved(true);
    } catch (e) {
      if (e instanceof DuplicateCheckinError) setError(t('checkin.duplicate'));
      else setError(t('checkin.saveFailed'));
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <Tile tone="breaks" label={t('checkin.title')} className="gap-4">
      {settings !== undefined && !consented && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">{t('checkin.consentTitle')}</h2>
          <p className="max-w-prose text-base">{t('checkin.consentText')}</p>
          <Link to={consentTo} className={cn(buttonVariants(), 'self-start')}>
            {t('checkin.consentCta')}
          </Link>
        </div>
      )}

      {consented && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <label htmlFor="checkin-code" className="text-base font-extrabold">
            {t('checkin.codeLabel')}
          </label>
          <input
            id="checkin-code"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            pattern={SESSION_CODE_PATTERN}
            aria-describedby="checkin-code-hint"
            value={code}
            onChange={(e) => {
              setCode(clean(e.target.value));
              setError(null);
              setSaved(false);
            }}
            className={cn(
              'min-h-16 w-full max-w-sm rounded-control border-2 border-border bg-surface px-4 text-center font-mono text-3xl font-extrabold tracking-[0.35em] text-text uppercase',
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl',
            )}
          />
          <p id="checkin-code-hint" className="text-sm font-semibold">
            {t('checkin.codeHint')}
          </p>
          {error && (
            <p role="alert" className="text-sm font-extrabold">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm font-extrabold">
              {t('checkin.saved')}
            </p>
          )}
          <Button
            type="submit"
            className="self-start"
            disabled={code.length !== 6 || items === undefined}
          >
            {t('checkin.confirm')}
          </Button>
        </form>
      )}

      {items !== undefined && items.length > 0 && <CheckinList items={items} />}
    </Tile>
  );
}
