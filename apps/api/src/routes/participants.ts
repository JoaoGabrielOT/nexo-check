import { CONSENT_VERSION, registerRequest } from '@nexo/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../db';
import { hashKey, requireParticipant } from '../plugins/participant-auth';

function participantId(req: FastifyRequest): string {
  if (!req.participant) throw new Error('requireParticipant não executou');
  return req.participant.id;
}

const consentVersion = z.number().int().min(1).max(CONSENT_VERSION);
const consentRequest = z.object({ consentVersion });

export async function participantRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient; registerLimitMax: number },
): Promise<void> {
  const { prisma } = opts;
  const auth = requireParticipant(prisma);

  app.post(
    '/participants',
    { config: { rateLimit: { max: opts.registerLimitMax, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const body = registerRequest.parse(req.body);
      const code = body.code;
      const version = consentVersion.parse(body.consentVersion);
      if (await prisma.participant.findUnique({ where: { code }, select: { id: true } })) {
        return reply
          .status(409)
          .send({ error: 'code_taken', message: 'Este código já está em uso.' });
      }
      const keyHash = await hashKey(body.key);
      try {
        await prisma.participant.create({
          data: { code, keyHash, consentVersion: version, consentAt: new Date() },
        });
      } catch (err) {
        // Corrida entre dois registros com o mesmo código (violação de unicidade).
        if ((err as { code?: string }).code === 'P2002') {
          return reply
            .status(409)
            .send({ error: 'code_taken', message: 'Este código já está em uso.' });
        }
        throw err;
      }
      return reply.status(201).send({ code });
    },
  );

  app.delete('/participants/me', { preHandler: auth }, async (req, reply) => {
    // deleteMany: uma segunda requisição concorrente não deve virar 500 (idempotente: 204).
    await prisma.participant.deleteMany({ where: { id: participantId(req) } });
    return reply.status(204).send();
  });

  app.patch('/participants/me/consent', { preHandler: auth }, async (req, reply) => {
    const { consentVersion: version } = consentRequest.parse(req.body);
    const id = participantId(req);
    const consentAt = new Date();
    const { count } = await prisma.participant.updateMany({
      where: { id },
      data: { consentVersion: version, consentAt },
    });
    // Apagado entre a autenticação e a atualização.
    if (count === 0) {
      return reply
        .status(401)
        .send({ error: 'unauthorized', message: 'Código ou chave do participante inválidos.' });
    }
    return { consentVersion: version, consentAt: consentAt.toISOString() };
  });
}
