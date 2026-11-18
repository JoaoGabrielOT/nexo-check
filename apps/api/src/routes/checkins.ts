import { checkinRequest, type CheckinResponse } from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../db';
import { requireParticipant } from '../plugins/participant-auth';

export async function checkinRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient },
): Promise<void> {
  const { prisma } = opts;

  app.post('/checkins', { preHandler: requireParticipant(prisma) }, async (req, reply) => {
    if (!req.participant) throw new Error('requireParticipant não executou');
    const participantId = req.participant.id;
    // O schema já normaliza o código (maiúsculas, sem espaços) e valida o alfabeto.
    const { sessionCode } = checkinRequest.parse(req.body);

    const session = await prisma.workshopSession.findUnique({ where: { code: sessionCode } });
    if (!session) {
      return reply
        .status(404)
        .send({ error: 'invalid_code', message: 'Código de oficina não encontrado.' });
    }
    const res: CheckinResponse = {
      status: 'confirmed',
      workshop: session.workshop === 1 ? 1 : 2,
      date: session.date.toISOString().slice(0, 10),
    };

    // Reenvio da fila offline: já confirmado continua confirmado, mesmo depois de expirar.
    const sessionId = session.id;
    const where = { participantId_sessionId: { participantId, sessionId } };
    if (await prisma.checkin.findUnique({ where })) return reply.status(200).send(res);

    if (Date.now() > session.expiresAt.getTime()) {
      return reply
        .status(410)
        .send({ error: 'expired', message: 'Este código de oficina expirou.' });
    }
    try {
      await prisma.checkin.create({ data: { participantId, sessionId } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      return reply.status(200).send(res);
    }
    return reply.status(201).send(res);
  });
}
