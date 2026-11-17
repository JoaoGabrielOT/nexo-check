import { useTranslation } from 'react-i18next';

export function ProjectPage() {
  const { t } = useTranslation();
  return <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.project')}</h1>;
}

export function QuestionnairePage() {
  const { t } = useTranslation();
  return <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.questionnaire')}</h1>;
}
