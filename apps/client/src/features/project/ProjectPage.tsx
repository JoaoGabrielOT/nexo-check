import { useLiveQuery } from 'dexie-react-hooks';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { getQuestionnaire, type QuestionnaireKind } from '@nexo/shared';
import { Alert, PageHeader, Tile, buttonVariants, cn, type TileTone } from '@nexo/ui';
import { db, getQuestionnaireResponses } from '../../db';
import { now } from '../../db/clock';
import type { LocalQuestionnaireResponse } from '../../db/schemas';
import { DraftBadge } from '../learn/DraftBadge';
import { CheckinTile } from './CheckinTile';
import { formatDayMonth, ratioPercent } from './helpers';
import { WorkshopsList } from './WorkshopsList';

const KINDS: { kind: QuestionnaireKind; tone: TileTone }[] = [
  { kind: 'inicial', tone: 'water' },
  { kind: 'educativo', tone: 'sleep' },
  { kind: 'final', tone: 'breaks' },
];

const FINAL_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type NextStep = 'inicial' | 'checkin' | 'final' | 'done';

function nextStep(latest: Map<string, LocalQuestionnaireResponse>, checkinCount: number): NextStep {
  const initial = latest.get('inicial');
  if (!initial) return 'inicial';
  if (latest.has('final')) return checkinCount === 0 ? 'checkin' : 'done';
  const days = (now().getTime() - new Date(initial.submittedAt).getTime()) / DAY_MS;
  if (checkinCount > 0 || days >= FINAL_AFTER_DAYS) return 'final';
  return 'checkin';
}

const heroAction =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-hero-action px-5 text-base font-extrabold text-hero-action-ink hover:brightness-105 ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

function NextStepHero({ step }: { step: NextStep }) {
  const { t } = useTranslation();
  const to =
    step === 'checkin' ? '/checkin' : step === 'done' ? null : `/projeto/questionario/${step}`;
  return (
    <section
      aria-label={t('project.next.label')}
      className="relative isolate overflow-hidden rounded-hero bg-hero p-6 text-hero-ink sm:p-8"
    >
      <span
        aria-hidden="true"
        className="absolute -top-16 -right-14 -z-10 size-44 rounded-full bg-bl sm:-top-24 sm:-right-16 sm:size-64 dark:bg-or"
      />
      <p aria-hidden="true" className="eyebrow">
        {t('project.next.label')}
      </p>
      <h2 className="mt-3 max-w-[22ch] text-[1.75rem] leading-[1.1] font-extrabold tracking-[-0.03em] text-balance sm:text-4xl">
        {t(`project.next.${step}Title`)}
      </h2>
      <p className="mt-3 max-w-prose text-base font-semibold text-balance">
        {t(`project.next.${step}Text`)}
      </p>
      {to && (
        <Link to={to} className={cn(heroAction, 'mt-5')}>
          {step === 'checkin' ? t('project.next.checkinCta') : t('project.next.answer')}
        </Link>
      )}
    </section>
  );
}

function QuestionnaireTile({
  kind,
  tone,
  response,
  locked,
}: {
  kind: QuestionnaireKind;
  tone: TileTone;
  response: LocalQuestionnaireResponse | undefined;
  locked: boolean;
}) {
  const { t } = useTranslation();
  const def = getQuestionnaire(kind);
  const to = `/projeto/questionario/${kind}`;
  return (
    <Tile tone={tone} label={def.title} className="justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-xl leading-tight font-extrabold tracking-[-0.02em]">
          {response
            ? t('project.answeredOn', { date: formatDayMonth(response.submittedAt) })
            : t('project.pending')}
        </p>
        {response?.score != null && (
          <p className="text-base font-semibold">
            {t('project.score', { percent: ratioPercent(response.score) })}
          </p>
        )}
        {locked && (
          <p className="mt-1 flex items-start gap-2 text-sm font-semibold">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.75} />
            {t('project.locked')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!locked && (
          <Link to={to} className={buttonVariants({ variant: response ? 'secondary' : 'primary' })}>
            {response
              ? kind === 'educativo'
                ? t('project.viewResult')
                : t('project.viewAnswers')
              : t('project.answer')}
          </Link>
        )}
        {def.draft && <DraftBadge />}
      </div>
    </Tile>
  );
}

const h2 = 'mb-4 text-2xl font-extrabold tracking-[-0.03em] text-balance';

export function ProjectPage() {
  const { t } = useTranslation();
  const responses = useLiveQuery(() => getQuestionnaireResponses(), []);
  const checkinCount = useLiveQuery(() => db.checkins.count(), []);

  const latest = new Map<string, LocalQuestionnaireResponse>();
  for (const r of [...(responses ?? [])].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)))
    latest.set(r.kind, r);
  const ready = responses !== undefined && checkinCount !== undefined;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 sm:gap-8">
      <PageHeader eyebrow={t('project.eyebrow')} title={t('project.title')} />

      {ready && <NextStepHero step={nextStep(latest, checkinCount)} />}

      <section aria-labelledby="project-questionnaires">
        <h2 id="project-questionnaires" className={h2}>
          {t('project.questionnaires')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {KINDS.map(({ kind, tone }) => (
            <QuestionnaireTile
              key={kind}
              kind={kind}
              tone={tone}
              response={latest.get(kind)}
              locked={kind === 'final' && !latest.has('inicial')}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="project-workshops">
        <h2 id="project-workshops" className={h2}>
          {t('project.workshops')}
        </h2>
        <WorkshopsList />
      </section>

      <section aria-label={t('checkin.title')}>
        <CheckinTile />
      </section>

      <Alert className="text-sm">{t('project.notice')}</Alert>
    </div>
  );
}
