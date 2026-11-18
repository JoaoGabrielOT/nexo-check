import { CONSENT_VERSION, isParticipantCode, normalizeCode, registerRequest } from '@nexo/shared';
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
      const code = normalizeCode(body.code);
      if (!isParticipantCode(code)) {
        return reply
          .status(400)
          .send({ error: 'invalid_request', message: 'Código de participante inválido.' });
      }
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
    await prisma.participant.delete({ where: { id: participantId(req) } });
    return reply.status(204).send();
  });

  app.patch('/participants/me/consent', { preHandler: auth }, async (req) => {
    const { consentVersion: version } = consentRequest.parse(req.body);
    const row = await prisma.participant.update({
      where: { id: participantId(req) },
      data: { consentVersion: version, consentAt: new Date() },
    });
    return { consentVersion: row.consentVersion, consentAt: row.consentAt.toISOString() };
  });
}
