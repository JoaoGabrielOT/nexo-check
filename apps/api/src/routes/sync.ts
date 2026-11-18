import {
  dailyLogSchema,
  habitEntrySchema,
  habitSchema,
  MAX_CLOCK_SKEW_MS,
  stripPrivateFields,
  type SyncEntityName,
} from '@nexo/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../db';
import { requireParticipant } from '../plugins/participant-auth';

const PULL_LIMIT = 1000;
const BODY_LIMIT = 2 * 1024 * 1024;

const iso = z.iso.datetime();
const base = { entityId: z.string().min(1), updatedAt: iso, deletedAt: iso.nullable() };

// Mesmo formato de `syncPushRequest`, mas o `dailyLog` aceita `note` de texto: o servidor o
// descarta (defesa em profundidade) em vez de depender só do cliente.
const pushRequest = z.object({
  changes: z
    .array(
      z.discriminatedUnion('entity', [
        z.object({ ...base, entity: z.literal('habit'), payload: habitSchema }),
        z.object({ ...base, entity: z.literal('habitEntry'), payload: habitEntrySchema }),
        z.object({ ...base, entity: z.literal('dailyLog'), payload: dailyLogSchema }),
      ]),
    )
    .max(500),
});

const cursorSchema = z.string().regex(/^\d{1,18}$/);

function participantId(req: FastifyRequest): string {
  if (!req.participant) throw new Error('requireParticipant não executou');
  return req.participant.id;
}

const sameInstant = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : new Date(a).getTime() === new Date(b).getTime();

export async function syncRoutes(
  app: FastifyInstance,
  opts: { prisma: PrismaClient },
): Promise<void> {
  const { prisma } = opts;
  const auth = requireParticipant(prisma);

  const maxSeq = async (id: string): Promise<string> => {
    const row = await prisma.syncRecord.aggregate({
      where: { participantId: id },
      _max: { serverSeq: true },
    });
    return (row._max.serverSeq ?? 0n).toString();
  };

  app.post('/sync', { preHandler: auth, bodyLimit: BODY_LIMIT }, async (req, reply) => {
    const id = participantId(req);
    const { changes } = pushRequest.parse(req.body);
    const limit = Date.now() + MAX_CLOCK_SKEW_MS;

    for (const c of changes) {
      if (
        c.entityId !== c.payload.id ||
        !sameInstant(c.updatedAt, c.payload.updatedAt) ||
        !sameInstant(c.deletedAt, c.payload.deletedAt)
      ) {
        return reply.status(400).send({
          error: 'invalid_request',
          message: 'Envelope inconsistente com o conteúdo da mudança.',
        });
      }
      if (new Date(c.updatedAt).getTime() > limit) {
        return reply.status(400).send({
          error: 'clock_skew',
          message: 'O relógio do aparelho está adiantado.',
        });
      }
    }

    const applied = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const c of changes) {
        const updatedAt = new Date(c.updatedAt);
        const deletedAt = c.deletedAt === null ? null : new Date(c.deletedAt);
        const entity: SyncEntityName = c.entity;
        const stored = {
          ...stripPrivateFields(entity, c.payload as never),
          updatedAt: updatedAt.toISOString(),
          deletedAt: deletedAt === null ? null : deletedAt.toISOString(),
        };
        // Um único comando: só o vencedor do LWW (updatedAt estritamente maior) escreve e recebe
        // novo server_seq; empate ou mais antigo não devolve linha.
        const rows = await tx.$queryRaw<{ server_seq: bigint }[]>`
          INSERT INTO sync_records
            (id, participant_id, entity, entity_id, payload, updated_at, deleted_at, server_seq)
          VALUES
            (gen_random_uuid()::text, ${id}, ${entity}, ${c.entityId},
             ${JSON.stringify(stored)}::jsonb, ${updatedAt}::timestamptz,
             ${deletedAt}::timestamptz, nextval('sync_server_seq'))
          ON CONFLICT (participant_id, entity, entity_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            server_seq = nextval('sync_server_seq')
          WHERE sync_records.updated_at < EXCLUDED.updated_at
          RETURNING server_seq`;
        count += rows.length;
      }
      return count;
    });

    return { applied, cursor: await maxSeq(id) };
  });

  app.get('/sync', { preHandler: auth }, async (req) => {
    const id = participantId(req);
    const { since = '0' } = z.object({ since: cursorSchema.optional() }).parse(req.query);
    const rows = await prisma.syncRecord.findMany({
      where: { participantId: id, serverSeq: { gt: BigInt(since) } },
      orderBy: { serverSeq: 'asc' },
      take: PULL_LIMIT + 1,
    });
    const page = rows.slice(0, PULL_LIMIT);
    const last = page[page.length - 1];
    return {
      changes: page.map((r) => ({
        entity: r.entity,
        entityId: r.entityId,
        updatedAt: r.updatedAt.toISOString(),
        deletedAt: r.deletedAt?.toISOString() ?? null,
        payload: r.payload,
      })),
      cursor: last ? last.serverSeq.toString() : since,
      hasMore: rows.length > PULL_LIMIT,
    };
  });
}
