import { useTranslation } from 'react-i18next';
import { PageHeader, Tile, cn } from '@nexo/ui';
import { useTheme, type Theme } from '../../app/theme';
import { AboutSection } from './AboutSection';
import { DataSection, type DataSectionProps } from './DataSection';
import { HabitsEditor } from './HabitsEditor';
import { RemindersSection } from './RemindersSection';
import { SyncSection } from './SyncSection';

const THEMES: Theme[] = ['light', 'dark', 'system'];

function AppearanceSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <Tile tone="plain" label={t('settings.appearance.title')}>
      <div
        role="radiogroup"
        aria-label={t('settings.appearance.theme')}
        className="flex w-fit max-w-full rounded-full bg-text/8 p-1 dark:bg-white/8"
      >
        {THEMES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => setTheme(value)}
            className={cn(
              'min-h-11 cursor-pointer rounded-full px-5 text-sm font-extrabold transition-colors',
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl',
              theme === value
                ? 'bg-navy text-white dark:bg-lav2 dark:text-navy'
                : 'text-text hover:bg-text/8',
            )}
          >
            {t(`settings.appearance.${value}`)}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        {t('settings.appearance.language')}: {t('settings.appearance.pt-BR')}
      </p>
    </Tile>
  );
}

export function ConfigPage({ deleteRemote }: DataSectionProps = {}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 sm:gap-5">
      <PageHeader title={t('pages.settings')} className="mb-1" />
      <AppearanceSection />
      <HabitsEditor />
      <RemindersSection />
      <SyncSection />
      <DataSection deleteRemote={deleteRemote} />
      <AboutSection />
    </div>
  );
}
