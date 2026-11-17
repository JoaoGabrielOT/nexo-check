import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  CONSENT_VERSION,
  generateParticipantCode,
  generateRecoveryKey,
  getMarkdown,
} from '@nexo/shared';
import { Alert, Button, Panel, toast } from '@nexo/ui';
import { MarkdownView } from '../../components/MarkdownView';
import { now } from '../../db/clock';
import { ensureDefaultHabits, getSettings, updateSettings } from '../../db';
import { ConsentStep } from './ConsentStep';

type Step = 'welcome' | 'consent' | 'code';

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-extrabold tracking-tight">
        {step === 'welcome'
          ? t('onboarding.welcomeTitle')
          : step === 'consent'
            ? t('onboarding.consentTitle')
            : t('onboarding.codeTitle')}
      </h1>

      {step === 'welcome' && (
        <>
          <p>{t('onboarding.welcomeIntro')}</p>
          <Alert>
            <MarkdownView body={getMarkdown('avisos/avisos.md').body} />
          </Alert>
          <Button onClick={() => setStep('consent')}>{t('onboarding.next')}</Button>
        </>
      )}

      {step === 'consent' && (
        <ConsentStep reconsent={reconsent} onAccept={accept} onDecline={decline} />
      )}

      {step === 'code' && credentials && (
        <>
          <Panel className="flex flex-col gap-4">
            <Credential
              label={t('onboarding.codeLabel')}
              copyLabel={t('onboarding.copyCode')}
              value={credentials.code}
            />
            <Credential
              label={t('onboarding.keyLabel')}
              copyLabel={t('onboarding.copyKey')}
              value={credentials.key}
            />
          </Panel>
          <Alert>
            <p className="font-semibold">{t('onboarding.keepKey')}</p>
          </Alert>
          <Button onClick={finish}>{t('onboarding.start')}</Button>
        </>
      )}
    </div>
  );
}

function Credential({
  label,
  copyLabel,
  value,
}: {
  label: string;
  copyLabel: string;
  value: string;
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
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="font-mono text-2xl font-extrabold tracking-wider break-all">{value}</code>
        <Button variant="secondary" aria-label={copyLabel} onClick={() => void copy()}>
          {t('onboarding.copy')}
        </Button>
      </div>
    </div>
  );
}
