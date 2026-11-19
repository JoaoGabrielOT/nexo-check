import { ArrowLeftRight, CircleAlert, CircleCheck, Download, Info, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, PageHeader, Tile, toast, type TileTone } from '@nexo/ui';
import { downloadFile } from '../../platform/files';
import { fetchCsv, getStats, type AdminIndicator, type AdminStats } from './adminApi';
import { useAdmin } from './AdminContext';

const TONES: Record<AdminIndicator['id'], TileTone> = {
  participation: 'water',
  comprehension: 'sleep',
  acceptance: 'breaks',
  adherence: 'breathing',
  stress: 'plain',
  activity_frequency: 'plain',
};

const STATUS_ICON = { met: CircleCheck, below: CircleAlert, comparison: ArrowLeftRight } as const;

function IndicatorCard({ item }: { item: AdminIndicator }) {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[item.status];
  const comparison = item.status === 'comparison';
  const movement = item.id === 'adherence' ? item.detail?.checklistMovement : undefined;
  return (
    <Tile tone={TONES[item.id]} label={t(`admin.indicators.names.${item.id}`)}>
      {/* Comparações trazem "antes … → depois …": menor, e sem cor de bom/ruim. */}
      <p
        className={
          comparison
            ? 'text-2xl leading-tight font-extrabold tracking-[-0.03em] tabular-nums'
            : 'text-[3.5rem] leading-none font-extrabold tracking-[-0.05em] tabular-nums'
        }
      >
        {item.value}
      </p>
      <p className="flex items-center gap-2 font-extrabold">
        <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.5} />
        {t(`admin.indicators.status.${item.status}`)}
      </p>
      <p className="text-sm">{t('admin.indicators.target', { target: item.target })}</p>
      {item.id === 'participation' && item.detail && (
        <p className="text-sm">
          {t('admin.indicators.participationDetail', {
            checkins: item.detail.checkins ?? 0,
            manual: item.detail.manual ?? 0,
          })}
        </p>
      )}
      {typeof movement === 'number' && (
        <p className="text-sm">
          {t('admin.indicators.checklistMovement', { percent: Math.floor(movement * 100 + 1e-9) })}
        </p>
      )}
      <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-tile-ink/15 pt-3 text-sm font-semibold">
        <span className="tabular-nums">{t('admin.indicators.n', { n: item.n })}</span>
        {item.smallSample && (
          <span className="flex items-center gap-1.5">
            <Info aria-hidden="true" className="size-4" />
            {t('admin.indicators.smallSample')}
          </span>
        )}
      </p>
    </Tile>
  );
}

export function IndicatorsPage() {
  const { t } = useTranslation();
  const { token, expireOn401 } = useAdmin();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    getStats(token).then(
      (data) => {
        if (!alive) return;
        setStats(data);
        setFailed(false);
        setBusy(false);
      },
      (e: unknown) => {
        if (!alive) return;
        setBusy(false);
        if (!expireOn401(e)) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [token, expireOn401, version]);

  const refresh = () => {
    setBusy(true);
    setVersion((v) => v + 1);
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { name, content } = await fetchCsv(token);
      downloadFile(name, content, 'text/csv;charset=utf-8');
    } catch (e) {
      if (!expireOn401(e)) toast(t('admin.indicators.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const time = stats
    ? new Date(stats.generatedAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('admin.indicators.title')}
        meta={
          stats && (
            <>
              <p>{t('admin.indicators.updatedAt', { time })}</p>
              <p>
                {t('admin.indicators.totals', {
                  participants: stats.totals.participants,
                  sessions: stats.totals.sessions,
                })}
              </p>
            </>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={refresh} disabled={busy}>
          <RefreshCw aria-hidden="true" className="size-4" />
          {t('admin.indicators.refresh')}
        </Button>
        <Button onClick={() => void exportCsv()} disabled={exporting}>
          <Download aria-hidden="true" className="size-4" />
          {t('admin.indicators.export')}
        </Button>
      </div>
      {failed && <Alert role="alert">{t('admin.indicators.loadFailed')}</Alert>}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.indicators.map((item) => (
            <IndicatorCard key={item.id} item={item} />
          ))}
        </div>
      )}
      <p className="max-w-prose text-sm text-muted">{t('admin.indicators.note')}</p>
    </div>
  );
}
