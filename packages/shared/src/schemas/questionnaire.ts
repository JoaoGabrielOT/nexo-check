import { z } from 'zod';

export const questionnaireKind = z.enum(['inicial', 'educativo', 'final']);
export const questionType = z.enum(['scale', 'single', 'multi', 'number', 'text']);
export const questionGroup = z.enum([
  'satisfaction',
  'adherence',
  'activity_frequency',
  'stress',
  'sleep',
  'sedentary',
]);

export const answerValue = z.union([z.number(), z.string(), z.array(z.string())]);
export const answers = z.record(z.string(), answerValue);

export const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    type: questionType,
    label: z.string().min(1),
    options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).optional(),
    correct: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().optional(),
    comparable: z.boolean().optional(),
    group: questionGroup.optional(),
  })
  .superRefine((q, ctx) => {
    const needsOptions = q.type === 'single' || q.type === 'multi';
    if (needsOptions && (!q.options || q.options.length < 2)) {
      ctx.addIssue({ code: 'custom', message: 'single/multi exige ao menos 2 options' });
    }
    if (q.correct !== undefined && q.type !== 'single') {
      ctx.addIssue({ code: 'custom', message: 'correct só vale para type single' });
    }
    if (q.correct !== undefined && !q.options?.some((o) => o.value === q.correct)) {
      ctx.addIssue({ code: 'custom', message: 'correct deve estar em options' });
    }
  });

export const questionnaireDefSchema = z
  .object({
    kind: questionnaireKind,
    version: z.number().int().positive(),
    draft: z.boolean(),
    title: z.string().min(1),
    intro: z.string().min(1),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((def, ctx) => {
    const ids = def.questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'ids de pergunta duplicados' });
    }
  });

export type QuestionnaireKind = z.infer<typeof questionnaireKind>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionnaireDef = z.infer<typeof questionnaireDefSchema>;
export type AnswerValue = z.infer<typeof answerValue>;
export type Answers = z.infer<typeof answers>;

/** Nota do questionário educativo: perguntas `single` com `correct`. */
export function scoreEducational(
  def: QuestionnaireDef,
  given: Answers,
): { correct: number; total: number; ratio: number } {
  const graded = def.questions.filter((q) => q.type === 'single' && q.correct !== undefined);
  const correct = graded.filter((q) => given[q.id] === q.correct).length;
  const total = graded.length;
  return { correct, total, ratio: total === 0 ? 0 : correct / total };
}

/** Remove as respostas de texto livre, que nunca saem do aparelho. */
export function stripTextAnswers(def: QuestionnaireDef, given: Answers): Answers {
  const textIds = new Set(def.questions.filter((q) => q.type === 'text').map((q) => q.id));
  return Object.fromEntries(Object.entries(given).filter(([id]) => !textIds.has(id)));
}
