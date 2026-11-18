import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  CONSENT_VERSION,
  generateParticipantCode,
  generateRecoveryKey,
  getMarkdown,
} from '@nexo/shared';
import { Button, cn, toast } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';
import { now } from '../../db/clock';
import { ensureDefaultHabits, getSettings, updateSettings } from '../../db';
import { ConsentStep } from './ConsentStep';

type Step = 'welcome' | 'consent' | 'code';
const STEPS: Step[] = ['welcome', 'consent', 'code'];

/** Ação principal da tela: laranja com texto navy (contraste AA nos dois temas). */
const primaryCta =
  'min-h-14 w-full px-8 text-base bg-or text-navy hover:bg-or/90 dark:bg-or dark:text-navy dark:hover:bg-or/90 sm:w-auto sm:self-start';

const title =
  'text-[2.75rem] leading-[0.98] font-extrabold tracking-[-0.045em] text-balance sm:text-6xl';

export function OnboardingPage({ reconsent = false }: { reconsent?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(reconsent ? 'consent' : 'welcome');
  const [credentials, setCredentials] = useState<{ code: string; key: string } | null>(null);

  const finish = () => navigate('/', { replace: true });

  const accept = async () => {
    const current = await getSettings();
    const participant = current.participant ?? {
      code: generateParticipantCode(),
      key: generateRecoveryKey(),
      registered: false,
    };
    // O consentimento é gravado antes dos hábitos para que eles entrem no outbox.
    await updateSettings({
      consent: { granted: true, version: CONSENT_VERSION, at: now().toISOString() },
      participant,
      onboardingDone: true,
    });
    await ensureDefaultHabits(now());
    if (reconsent && current.participant) {
      finish();
      return;
    }
    setCredentials({ code: participant.code, key: participant.key });
    setStep('code');
  };

  const decline = async () => {
    await updateSettings({ consent: null, onboardingDone: true });
    await ensureDefaultHabits(now());
    finish();
  };

  // Uma ideia por tela; o reconsentimento é uma tela só, sem indicador de passos.
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-7 pt-4 sm:pt-14">
      {!reconsent && <StepDots current={STEPS.indexOf(step)} total={STEPS.length} />}

      {/* key: cada passo entra com um fade curto (só CSS, desligado com movimento reduzido). */}
      <div
        key={step}
        className="flex flex-col gap-6 motion-safe:transition-[opacity,translate] motion-safe:duration-300 motion-safe:starting:translate-y-2 motion-safe:starting:opacity-0"
      >
        {step === 'welcome' && (
          <>
            <div>
              <h1 className={title}>{t('onboarding.welcomeTitle')}</h1>
              <p className="mt-4 max-w-prose text-lg leading-relaxed font-medium">
                {t('onboarding.welcomeIntro')}
              </p>
            </div>
            <section
              aria-labelledby="onboarding-before"
              className="rounded-panel border border-text/10 bg-surface p-6 sm:p-7 dark:border-tile-edge dark:bg-tile-plain"
            >
              <h2 id="onboarding-before" className="text-lg font-extrabold tracking-[-0.02em]">
                {t('onboarding.beforeStart')}
              </h2>
              <MarkdownView
                body={getMarkdown('avisos/avisos.md').body}
                className="text-[0.9375rem] [&_li]:my-2 [&_ul]:mb-0"
              />
            </section>
            <Button className={primaryCta} onClick={() => setStep('consent')}>
              {t('onboarding.next')}
            </Button>
          </>
        )}

        {step === 'consent' && (
          <>
            <h1 className={title}>{t('onboarding.consentTitle')}</h1>
            <ConsentStep reconsent={reconsent} onAccept={accept} onDecline={decline} />
          </>
        )}

        {step === 'code' && credentials && (
          <>
            <h1 className={title}>{t('onboarding.codeTitle')}</h1>
            <section
              aria-labelledby="onboarding-code"
              className="relative isolate overflow-hidden rounded-hero bg-hero p-6 text-hero-ink sm:p-8"
            >
              <span
                aria-hidden="true"
                className="absolute -top-10 -right-6 -z-10 h-28 w-16 rounded-full bg-bl sm:h-36 sm:w-20 dark:bg-or"
              />
              <p id="onboarding-code" className="eyebrow">
                {t('onboarding.codeLabel')}
              </p>
              <code className="mt-3 block font-mono text-[2.5rem] leading-none font-extrabold tracking-[0.02em] tabular-nums break-all sm:text-6xl">
                {credentials.code}
              </code>
              <CopyButton
                value={credentials.code}
                label={t('onboarding.copyCode')}
                className="mt-6 bg-hero-action text-hero-action-ink hover:bg-hero-action/90 dark:bg-hero-action dark:text-hero-action-ink dark:hover:bg-hero-action/90"
              />
            </section>
            <section
              aria-labelledby="onboarding-key"
              className="flex flex-col gap-3 rounded-panel border border-text/10 bg-surface p-6 sm:p-7 dark:border-tile-edge dark:bg-tile-plain"
            >
              <p id="onboarding-key" className="eyebrow text-muted">
                {t('onboarding.keyLabel')}
              </p>
              <code className="font-mono text-xl font-bold tracking-[0.04em] tabular-nums break-all sm:text-2xl">
                {credentials.key}
              </code>
              <div className="flex items-start gap-3 rounded-control bg-tile-sleep p-4 text-tile-ink dark:bg-surface-2">
                <KeyRound
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 dark:text-tile-label-sleep"
                  strokeWidth={2.25}
                />
                <p className="text-sm leading-relaxed font-semibold">{t('onboarding.keepKey')}</p>
              </div>
              <CopyButton
                value={credentials.key}
                label={t('onboarding.copyKey')}
                variant="secondary"
              />
            </section>
            <Button className={primaryCta} onClick={finish}>
              {t('onboarding.start')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2 rounded-full',
              i === current ? 'w-7 bg-navy dark:bg-peach' : 'w-2',
              i < current && 'bg-navy/55 dark:bg-peach/55',
              i > current && 'bg-text/20',
            )}
          />
        ))}
      </span>
      <p className="text-sm font-bold text-muted">
        {t('onboarding.step', { n: current + 1, total })}
      </p>
    </div>
  );
}

function CopyButton({
  value,
  label,
  variant,
  className,
}: {
  value: string;
  label: string;
  variant?: 'secondary';
  className?: string;
}) {
  const { t } = useTranslation();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(t('onboarding.copied'));
    } catch {
      // Sem permissão de área de transferência: o valor continua visível para cópia manual.
    }
  };
  return (
    <Button
      variant={variant}
      aria-label={label}
      onClick={() => void copy()}
      className={cn('self-start', className)}
    >
      {t('onboarding.copy')}
    </Button>
  );
}
