import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  getQuestionnaire,
  questionnaireKind,
  scoreEducational,
  type Answers,
  type Question,
  type QuestionnaireDef,
} from '@nexo/shared';
import { Alert, Button, PageHeader, ProgressRing, Tile, buttonVariants, cn } from '@nexo/ui';
import { getQuestionnaireResponses, saveQuestionnaireResponse } from '../../db';
import { newId } from '../../db/ids';
import { now } from '../../db/clock';
import type { LocalQuestionnaireResponse } from '../../db/schemas';
import { DraftBadge } from '../learn/DraftBadge';
import { QuestionField } from './QuestionField';
import {
  formatDayMonth,
  isAnswered,
  optionLabel,
  questionTitle,
  scorePercent,
  scaleWords,
} from './helpers';

const wrap = 'mx-auto flex w-full max-w-[720px] flex-col gap-6 sm:gap-8';

function BackToProject() {
  const { t } = useTranslation();
  return (
    <Link to="/projeto" className={cn(buttonVariants({ variant: 'ghost' }), 'self-start -ml-3')}>
      <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={3} />
      {t('questionnaire.backToProject')}
    </Link>
  );
}

function formatAnswer(q: Question, v: Answers[string] | undefined, empty: string): string {
  if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return empty;
  if (q.type === 'single') return optionLabel(q, String(v));
  if (q.type === 'multi' && Array.isArray(v)) return v.map((x) => optionLabel(q, x)).join(', ');
  if (q.type === 'scale') {
    const word = scaleWords(q)[Number(v) - 1];
    return word ? `${v} — ${word}` : String(v);
  }
  if (q.type === 'number') return q.unit ? `${v} ${q.unit}` : String(v);
  return String(v);
}

function Result({ def, answers }: { def: QuestionnaireDef; answers: Answers }) {
  const { t } = useTranslation();
  const { correct, total } = scoreEducational(def, answers);
  return (
    <>
      <section
        aria-label={t('questionnaire.resultTitle')}
        className="relative isolate overflow-hidden rounded-hero bg-hero p-6 text-hero-ink sm:p-8"
      >
        <span
          aria-hidden="true"
          className="absolute -top-16 -right-14 -z-10 size-44 rounded-full bg-bl sm:size-64 dark:bg-or"
        />
        <p aria-hidden="true" className="eyebrow">
          {t('questionnaire.resultTitle')}
        </p>
        <p className="mt-3 text-[4.5rem] leading-[0.9] font-extrabold tracking-[-0.05em] tabular-nums sm:text-[6rem]">
          {scorePercent(correct, total)}%
        </p>
        <p className="mt-3 text-lg font-semibold">
          {t('questionnaire.resultCount', { correct, total })}
        </p>
        <p className="mt-1 max-w-prose text-sm font-semibold text-balance">
          {t('questionnaire.resultHint')}
        </p>
      </section>
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari: lista sem marcador */}
      <ol role="list" className="flex flex-col gap-3">
        {def.questions.map((q) => {
          const given = answers[q.id];
          const hit = given === q.correct;
          return (
            <li key={q.id} className="rounded-tile border border-text/15 bg-surface/70 p-5">
              <h3 className="text-base leading-snug font-extrabold">{q.label}</h3>
              <p className="mt-3 flex items-start gap-2 rounded-control bg-tile-breaks px-3 py-2.5 text-sm font-semibold text-tile-ink dark:bg-peach/15">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={3.5} />
                <span>
                  <span className="font-extrabold">{t('questionnaire.correctAnswer')}: </span>
                  {optionLabel(q, q.correct ?? '')}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted">
                {hit
                  ? t('questionnaire.matched')
                  : `${t('questionnaire.yourAnswer')}: ${formatAnswer(q, given, t('questionnaire.unanswered'))}`}
              </p>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Done({ def, response }: { def: QuestionnaireDef; response: LocalQuestionnaireResponse }) {
  const { t } = useTranslation();
  return (
    <div className={wrap}>
      <PageHeader
        eyebrow={t('questionnaire.alreadyDone', { date: formatDayMonth(response.submittedAt) })}
        title={def.title}
      />
      {def.kind === 'educativo' ? (
        <Result def={def} answers={response.answers} />
      ) : (
        <Tile tone="breathing" label={t('questionnaire.label')}>
          <p className="text-xl font-extrabold tracking-[-0.02em]">
            {t('questionnaire.doneTitle')}
          </p>
          <p className="text-base">{t('questionnaire.doneText')}</p>
        </Tile>
      )}
      <BackToProject />
    </div>
  );
}

function Locked({ def }: { def: QuestionnaireDef }) {
  const { t } = useTranslation();
  return (
    <div className={wrap}>
      <PageHeader eyebrow={t('project.eyebrow')} title={def.title} />
      <Tile tone="sleep" label={t('questionnaire.label')}>
        <Lock aria-hidden="true" className="size-6" strokeWidth={2.5} />
        <h2 className="text-xl font-extrabold tracking-[-0.02em]">
          {t('questionnaire.lockedTitle')}
        </h2>
        <p className="text-base">{t('questionnaire.lockedText')}</p>
        <Link to="/projeto/questionario/inicial" className={cn(buttonVariants(), 'self-start')}>
          {t('project.answer')}
        </Link>
      </Tile>
      <BackToProject />
    </div>
  );
}

// Passos: -1 apresentação, 0..n-1 perguntas, n revisão.
function Flow({
  def,
  onSaved,
}: {
  def: QuestionnaireDef;
  onSaved: (r: LocalQuestionnaireResponse) => void;
}) {
  const { t } = useTranslation();
  const total = def.questions.length;
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Answers>({});
  const [fromReview, setFromReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const stepRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Troca de tela: o foco vai para o conteúdo novo (leitor de tela e teclado seguem o fluxo).
  useEffect(() => {
    if (first.current) first.current = false;
    else stepRef.current?.focus();
  }, [step]);

  const question = step >= 0 && step < total ? def.questions[step] : undefined;
  const setAnswer = (q: Question, v: Answers[string] | undefined) =>
    setAnswers((prev) => {
      const rest = Object.fromEntries(Object.entries(prev).filter(([id]) => id !== q.id));
      return v === undefined ? rest : { ...rest, [q.id]: v };
    });

  const submit = async () => {
    setSaving(true);
    const score = def.kind === 'educativo' ? scoreEducational(def, answers).ratio : null;
    const response: Omit<LocalQuestionnaireResponse, 'syncedAt'> = {
      id: newId(),
      kind: def.kind,
      version: def.version,
      answers,
      score,
      submittedAt: now().toISOString(),
    };
    await saveQuestionnaireResponse(response);
    onSaved({ ...response, syncedAt: null });
  };

  const next = () => {
    if (fromReview) {
      setFromReview(false);
      setStep(total);
    } else setStep(step + 1);
  };

  return (
    <div className={wrap}>
      <PageHeader
        eyebrow={t('project.eyebrow')}
        title={def.title}
        meta={def.draft ? <DraftBadge /> : undefined}
      />
      <Tile tone="water" label={t('questionnaire.label')}>
        <div ref={stepRef} tabIndex={-1} className="flex flex-col gap-6 outline-none">
          {step === -1 && (
            <>
              <p className="max-w-prose text-base leading-relaxed">{def.intro}</p>
              <p className="max-w-prose text-sm font-semibold">{t('questionnaire.voluntary')}</p>
              <Button className="self-start" onClick={() => setStep(0)}>
                {t('questionnaire.start')}
              </Button>
            </>
          )}

          {question && (
            <>
              <div className="flex items-center gap-3">
                <ProgressRing
                  value={(step + 1) / total}
                  size={44}
                  stroke={5}
                  label={t('questionnaire.progressLabel', { current: step + 1, total })}
                />
                <p className="text-sm font-extrabold tabular-nums">
                  {t('questionnaire.progress', { current: step + 1, total })}
                </p>
              </div>
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.id]}
                onChange={(v) => setAnswer(question, v)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFromReview(false);
                    setStep(step - 1);
                  }}
                >
                  {t('questionnaire.back')}
                </Button>
                <Button disabled={!isAnswered(question, answers[question.id])} onClick={next}>
                  {fromReview ? t('questionnaire.backToReview') : t('questionnaire.next')}
                </Button>
              </div>
            </>
          )}

          {step === total && (
            <>
              <div>
                <h2 className="text-2xl font-extrabold tracking-[-0.03em]">
                  {t('questionnaire.review')}
                </h2>
                <p className="mt-1 text-sm font-semibold">{t('questionnaire.reviewHint')}</p>
              </div>
              {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari: lista sem marcador */}
              <ol role="list" className="flex flex-col divide-y divide-tile-ink/15">
                {def.questions.map((q, i) => (
                  <li key={q.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{questionTitle(q)}</p>
                      <p className="mt-0.5 text-base font-extrabold break-words">
                        {formatAnswer(q, answers[q.id], t('questionnaire.unanswered'))}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      aria-label={`${t('questionnaire.edit')}: ${questionTitle(q)}`}
                      onClick={() => {
                        setFromReview(true);
                        setStep(i);
                      }}
                    >
                      {t('questionnaire.edit')}
                    </Button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep(total - 1)}>
                  {t('questionnaire.back')}
                </Button>
                <Button disabled={saving} onClick={() => void submit()}>
                  {t('questionnaire.submit')}
                </Button>
              </div>
            </>
          )}
        </div>
      </Tile>
      <BackToProject />
    </div>
  );
}

function QuestionnaireView({ def }: { def: QuestionnaireDef }) {
  const responses = useLiveQuery(() => getQuestionnaireResponses(), []);
  const [justSaved, setJustSaved] = useState<LocalQuestionnaireResponse | null>(null);
  if (responses === undefined) return null;

  const latest = (kind: string) =>
    responses
      .filter((r) => r.kind === kind)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  const existing = justSaved ?? latest(def.kind);

  if (existing) return <Done def={def} response={existing} />;
  if (def.kind === 'final' && !latest('inicial')) return <Locked def={def} />;
  return <Flow def={def} onSaved={setJustSaved} />;
}

export function QuestionnairePage() {
  const { t } = useTranslation();
  const { kind } = useParams();
  const parsed = questionnaireKind.safeParse(kind);
  if (!parsed.success) {
    return (
      <div className={wrap}>
        <PageHeader title={t('questionnaire.notFound')} />
        <Alert>
          <BackToProject />
        </Alert>
      </div>
    );
  }
  return <QuestionnaireView def={getQuestionnaire(parsed.data)} />;
}
