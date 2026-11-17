import { useTranslation } from 'react-i18next';

export function LearnPage() {
  const { t } = useTranslation();
  return <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.learn')}</h1>;
}

export function ArticlePage() {
  const { t } = useTranslation();
  return <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.article')}</h1>;
}
