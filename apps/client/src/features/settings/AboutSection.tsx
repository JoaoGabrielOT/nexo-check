import { useTranslation } from 'react-i18next';
import { getMarkdown } from '@nexo/shared';
import { Button, Tile, toast } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';

const REPO_URL = 'https://github.com/JoaoGabrielOT/nexo-check';

export function AboutSection() {
  const { t } = useTranslation();

  const checkUpdates = async () => {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) {
      toast(t('settings.about.unavailable'));
      return;
    }
    try {
      await registration.update();
      toast(t('settings.about.checked'));
    } catch {
      toast(t('errors.generic'));
    }
  };

  return (
    <>
      <Tile tone="plain" label={t('settings.about.title')}>
        <p className="font-extrabold">
          {t('settings.about.version', { version: __APP_VERSION__ })}
        </p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="w-fit font-semibold underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl"
        >
          {t('settings.about.repo')}
        </a>
        <Button variant="secondary" className="self-start" onClick={() => void checkUpdates()}>
          {t('settings.about.check')}
        </Button>
      </Tile>
      <Tile tone="plain" label={t('settings.notices.title')}>
        <MarkdownView body={getMarkdown('avisos/avisos.md').body} className="text-sm" />
      </Tile>
    </>
  );
}
