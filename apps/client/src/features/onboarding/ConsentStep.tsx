import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarkdown } from '@nexo/shared';
import { Button, toast } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';

export interface ConsentStepProps {
  reconsent: boolean;
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
}

export function ConsentStep({ reconsent, onAccept, onDecline }: ConsentStepProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => void | Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch {
      toast(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p>{reconsent ? t('onboarding.reconsentIntro') : t('onboarding.consentIntro')}</p>
      <div>
        <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? t('onboarding.hideFull') : t('onboarding.readFull')}
        </Button>
        {open && (
          <div
            role="region"
            aria-label={t('onboarding.fullRegion')}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- região rolável precisa de foco para o teclado
            tabIndex={0}
            className="mt-2 max-h-80 overflow-y-auto rounded-card border-2 border-border bg-card p-4"
          >
            <MarkdownView body={getMarkdown('avisos/lgpd.md').body} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Button disabled={busy} onClick={() => void run(onAccept)()}>
          {t('onboarding.accept')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void run(onDecline)()}>
          {t('onboarding.decline')}
        </Button>
      </div>
    </>
  );
}
