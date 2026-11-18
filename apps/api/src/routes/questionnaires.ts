import {
  getQuestionnaire,
  MAX_CLOCK_SKEW_MS,
  questionnaireKind,
  questionnaireSubmit,
  scoreEducational,
  stripTextAnswers,
  type Answers,
  type Question,
  type QuestionnaireDef,
} from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../db';
import { requireParticipant } from '../plugins/participant-auth';

/** Mensagem de erro se `value` não serve para a pergunta; `null` se serve. */
function checkValue(q: Question, value: unknown): string | null {
  const bad = `Resposta inválida para "${q.id}".`;
  const inRange = (n: number) =>
    (q.min === undefined || n >= q.min) && (q.max === undefined || n <= q.max);
  const optionValues = new Set((q.options ?? []).map((o) => o.value));
  switch (q.type) {
    case 'scale':
      return typeof value === 'number' && Number.isInteger(value) && inRange(value) ? null : bad;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && inRange(value) ? null : bad;
    case 'single':
      return typeof value === 'string' && optionValues.has(value) ? null : bad;
    case 'multi':
      return Array.isArray(value) && value.every((v) => optionValues.has(v)) ? null : bad;
    case 'text':
      return null;
  }
}

function validateAnswers(def: QuestionnaireDef, given: Answers): string | null {
  const byId = new Map(def.questions.map((q) => [q.id, q]));
  for (const [id, value] of Object.entries(given)) {
    const q = byId.get(id);
    if (!q) return `Pergunta desconhecida: "${id}".`;
    const err = checkValue(q, value);
    if (err) return err;
  }
  return null;
}

const invalid = (message: string) => ({ error: 'invalid_request', message });

export async function questionnaireRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient },
): Promise<void> {
  const { prisma } = opts;

  app.post('/questionnaires', { preHandler: requireParticipant(prisma) }, async (req, reply) => {
    if (!req.participant) throw new Error('requireParticipant não executou');
    const participantId = req.participant.id;
    const body = questionnaireSubmit.parse(req.body);

    const kind = questionnaireKind.safeParse(body.kind);
    if (!kind.success) return reply.status(400).send(invalid('Questionário desconhecido.'));
    const version = Number(body.version);
    if (!Number.isInteger(version) || version < 1) {
      return reply.status(400).send(invalid('Versão inválida.'));
    }
    const submittedAt = new Date(body.submittedAt);
    if (submittedAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
      return reply
        .status(400)
        .send({ error: 'clock_skew', message: 'O relógio do aparelho está adiantado.' });
    }

    const def = getQuestionnaire(kind.data);
    const current = version === def.version;
    if (current) {
      const err = validateAnswers(def, body.answers);
      if (err) return reply.status(400).send(invalid(err));
    }

    const clientId = body.id;
    const where = { participantId_clientId: { participantId, clientId } };
    const stored = await prisma.questionnaireResponse.findUnique({ where });
    if (stored) return reply.status(200).send({ score: stored.score });

    const answers = stripTextAnswers(def, body.answers);
    // A nota vem sempre do servidor, e só para a versão que ele conhece.
    const score =
      kind.data === 'educativo' && current ? scoreEducational(def, answers).ratio : null;
    try {
      await prisma.questionnaireResponse.create({
        data: { participantId, clientId, kind: kind.data, version, answers, score, submittedAt },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const winner = await prisma.questionnaireResponse.findUniqueOrThrow({ where });
      return reply.status(200).send({ score: winner.score });
    }
    return reply.status(201).send({ score });
  });
}
