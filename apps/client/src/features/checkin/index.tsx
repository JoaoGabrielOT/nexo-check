import { useTranslation } from 'react-i18next';

export function CheckinPage() {
  const { t } = useTranslation();
  return <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.checkin')}</h1>;
}
