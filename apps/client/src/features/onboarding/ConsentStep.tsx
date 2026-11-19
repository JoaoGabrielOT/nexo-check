import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarkdown } from '@nexo/shared';
import { Button, cn, toast } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';

export interface ConsentStepProps {
  reconsent: boolean;
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
  /** Quem já participa em outro aparelho restaura com código e chave, sem gerar outro participante. */
  onRestore?: () => void;
}

// As duas escolhas têm o mesmo tamanho, uma sob a outra: nenhuma é empurrada.
const choice = 'min-h-14 w-full px-6 text-base';

export function ConsentStep({ reconsent, onAccept, onDecline, onRestore }: ConsentStepProps) {
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
      <p className="max-w-prose text-lg leading-relaxed font-medium">
        {reconsent ? t('onboarding.reconsentIntro') : t('onboarding.consentIntro')}
      </p>
      <div>
        <Button
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="-ml-3"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 motion-safe:transition-transform', open && 'rotate-180')}
            strokeWidth={2.75}
          />
          {open ? t('onboarding.hideFull') : t('onboarding.readFull')}
        </Button>
        {open && (
          <div
            role="region"
            aria-label={t('onboarding.fullRegion')}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- região rolável precisa de foco para o teclado
            tabIndex={0}
            className="mt-2 max-h-80 overflow-y-auto rounded-tile border border-text/10 bg-surface p-5 text-[0.9375rem] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-bl focus-visible:outline-solid dark:border-tile-edge dark:bg-tile-plain"
          >
            <MarkdownView body={getMarkdown('avisos/lgpd.md').body} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Button className={choice} disabled={busy} onClick={() => void run(onAccept)()}>
          {t('onboarding.accept')}
        </Button>
        <Button
          variant="secondary"
          className={choice}
          disabled={busy}
          onClick={() => void run(onDecline)()}
        >
          {t('onboarding.decline')}
        </Button>
        {onRestore && (
          <Button variant="ghost" className={choice} disabled={busy} onClick={onRestore}>
            {t('onboarding.restoreExisting')}
          </Button>
        )}
      </div>
    </>
  );
}
