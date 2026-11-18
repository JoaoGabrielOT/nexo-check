import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@nexo/ui';
import { CheckinTile } from '../project/CheckinTile';

// Abre direto pelo QR da oficina (/checkin?c=CODIGO), mesmo antes do onboarding.
export function CheckinPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
      <PageHeader eyebrow={t('project.eyebrow')} title={t('pages.checkin')} />
      <CheckinTile initialCode={params.get('c') ?? ''} />
    </div>
  );
}
