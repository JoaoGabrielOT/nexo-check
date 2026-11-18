import { Check, Minus, Plus } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ScalePills, cn } from '@nexo/ui';
import type { Question, AnswerValue } from '@nexo/shared';
import { questionTitle, scaleWords } from './helpers';

export interface QuestionFieldProps {
  question: Question;
  value: AnswerValue | undefined;
  /** `undefined` apaga a resposta. */
  onChange: (value: AnswerValue | undefined) => void;
}

const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-bl';

// Pílula grande de opção; o marcado inverte as cores (e mostra o "check" nas de marcar várias).
const pill =
  'flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-control border-2 px-4 py-3 text-left text-base font-semibold leading-snug ' +
  'motion-safe:transition-colors ' +
  focusRing;
const pillOff = 'border-text/25 bg-surface/70 text-text hover:border-text/60';
const pillOn =
  'border-navy bg-navy text-[#f7f5f2] dark:border-peach dark:bg-peach dark:text-navy font-extrabold';

const NUMBER_RE = /^\d+([.,]\d+)?$/;

const NEXT: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function SingleField({
  question,
  value,
  onChange,
  labelId,
}: QuestionFieldProps & { labelId: string }) {
  const options = question.options ?? [];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    refs.current[i]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    let target: number | null = null;
    if (e.key in NEXT) target = (i + (NEXT[e.key] ?? 0) + options.length) % options.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = options.length - 1;
    if (target === null) return;
    e.preventDefault();
    select(target);
  };
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col gap-2.5">
      {options.map((o, i) => {
        const checked = value === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (value === undefined && i === 0) ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(pill, checked ? pillOn : pillOff)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiField({
  question,
  value,
  onChange,
  labelId,
}: QuestionFieldProps & { labelId: string }) {
  const chosen = Array.isArray(value) ? value : [];
  const toggle = (v: string) => {
    const next = chosen.includes(v) ? chosen.filter((c) => c !== v) : [...chosen, v];
    onChange(next.length > 0 ? next : undefined);
  };
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2.5">
      {(question.options ?? []).map((o) => {
        const checked = chosen.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => toggle(o.value)}
            className={cn(pill, checked ? pillOn : pillOff)}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-md border-2',
                checked ? 'border-current' : 'border-text/40',
              )}
            >
              {checked && <Check className="size-4" strokeWidth={3.5} />}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const roundBtn =
  'grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-text/40 text-text transition-colors hover:bg-text/8 ' +
  focusRing +
  ' disabled:cursor-not-allowed disabled:opacity-40';

function NumberField({
  question,
  value,
  onChange,
  labelId,
}: QuestionFieldProps & { labelId: string }) {
  const { t } = useTranslation();
  const min = question.min ?? 0;
  const max = question.max ?? 999;
  const step = question.unit === 'horas' ? 0.5 : 1;
  const current = typeof value === 'number' ? value : undefined;
  // O texto digitado fica local ("7," ainda não é número); só o número válido vira resposta.
  const [text, setText] = useState(current === undefined ? '' : String(current));
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const commit = (n: number | undefined) => {
    onChange(n);
    setText(n === undefined ? '' : String(n));
  };
  const parse = (raw: string) =>
    NUMBER_RE.test(raw.trim()) ? Number(raw.trim().replace(',', '.')) : null;
  // Enquanto digita, só um número válido e dentro dos limites vira resposta; o resto fica sem resposta.
  const onType = (raw: string) => {
    setText(raw);
    const n = parse(raw);
    onChange(n !== null && n >= min && n <= max ? n : undefined);
  };
  // Ao sair do campo: número válido é ajustado aos limites; texto inválido volta ao último valor.
  const onBlurField = () => {
    const n = parse(text);
    if (n !== null) commit(clamp(n));
    else setText(current === undefined ? '' : String(current));
  };
  const unit = question.unit;
  return (
    <div role="group" aria-labelledby={labelId} className="flex items-center gap-3">
      <button
        type="button"
        className={roundBtn}
        aria-label={t('questionnaire.decrease')}
        disabled={current !== undefined && current <= min}
        onClick={() => commit(current === undefined ? min : clamp(current - step))}
      >
        <Minus aria-hidden="true" className="size-5" strokeWidth={3} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={
          unit ? t('questionnaire.numberValue', { unit }) : t('questionnaire.numberValueNoUnit')
        }
        value={text}
        placeholder={String(min)}
        onChange={(e) => onType(e.target.value)}
        onBlur={onBlurField}
        className={cn(
          'min-h-14 w-24 rounded-control border-2 border-border bg-surface px-3 text-center text-2xl font-extrabold tabular-nums text-text',
          focusRing,
        )}
      />
      {unit && <span className="text-base font-semibold text-muted">{unit}</span>}
      <button
        type="button"
        className={roundBtn}
        aria-label={t('questionnaire.increase')}
        disabled={current !== undefined && current >= max}
        onClick={() => commit(current === undefined ? min : clamp(current + step))}
      >
        <Plus aria-hidden="true" className="size-5" strokeWidth={3} />
      </button>
    </div>
  );
}

function TextField({ value, onChange, labelId }: QuestionFieldProps & { labelId: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-labelledby={labelId}
        rows={4}
        value={typeof value === 'string' ? value : ''}
        placeholder={t('questionnaire.textPlaceholder')}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className={cn(
          'w-full resize-y rounded-control border-2 border-border bg-surface p-4 text-base text-text placeholder:text-muted',
          focusRing,
        )}
      />
      <p className="text-sm font-semibold text-muted">{t('questionnaire.textNote')}</p>
    </div>
  );
}

// A pergunta (h2) e o controle ficam juntos: o título nomeia o grupo de opções.
export function QuestionField(props: QuestionFieldProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const { question, value, onChange } = props;
  const title = questionTitle(question);
  return (
    <div className="flex flex-col gap-5">
      <h2
        id={labelId}
        tabIndex={-1}
        className="outline-none text-2xl leading-tight font-extrabold tracking-[-0.03em] text-balance sm:text-[1.75rem]"
      >
        {title}
      </h2>
      {question.type === 'scale' && (
        <ScalePills
          label={title}
          hideLabel
          value={typeof value === 'number' ? (value as 1 | 2 | 3 | 4 | 5) : null}
          onChange={onChange}
          words={scaleWords(question)}
          formatLabel={(n, word) =>
            word ? t('questionnaire.scaleOption', { n, word }) : String(n)
          }
        />
      )}
      {question.type === 'single' && <SingleField {...props} labelId={labelId} />}
      {question.type === 'multi' && <MultiField {...props} labelId={labelId} />}
      {question.type === 'number' && <NumberField {...props} labelId={labelId} />}
      {question.type === 'text' && <TextField {...props} labelId={labelId} />}
    </div>
  );
}
