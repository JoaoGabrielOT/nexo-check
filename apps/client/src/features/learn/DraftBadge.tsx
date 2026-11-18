import { useTranslation } from 'react-i18next';
import { cn } from '@nexo/ui';

export function DraftBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border-2 border-current px-2.5 py-0.5 text-xs font-extrabold',
        className,
      )}
    >
      {t('learn.draft')}
    </span>
  );
}
