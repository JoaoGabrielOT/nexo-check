import { useTranslation } from 'react-i18next';

export function DraftBadge() {
  const { t } = useTranslation();
  return (
    <span className="ml-2 inline-block rounded-full border-2 border-border px-2 text-xs font-extrabold">
      {t('learn.draft')}
    </span>
  );
}
