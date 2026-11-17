import { useTranslation } from 'react-i18next';

export default function AdminRoutes() {
  const { t } = useTranslation();
  return <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.admin')}</h1>;
}
