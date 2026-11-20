import {
  dailyLogSchema,
  MAX_CLOCK_SKEW_MS,
  stripPrivateFields,
  syncChangeSchema,
  type SyncEntityName,
} from '@nexo/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '../db';
import { requireParticipant } from '../plugins/participant-auth';

const PULL_LIMIT = 1000;
const BODY_LIMIT = 512 * 1024;

// Derivado de `syncChangeSchema`: todas as opções são mantidas (uma entidade nova entra sozinha,
// com o schema do shared) e só a do `dailyLog`, escolhida pelo literal, troca o payload por
// `dailyLogSchema`, que aceita `note` de texto: o servidor o descarta (defesa em profundidade)
// em vez de depender só do cliente.
const changeOptions = syncChangeSchema.options.map((o) =>
  o.shape.entity.value === 'dailyLog' ? o.extend({ payload: dailyLogSchema }) : o,
) as unknown as typeof syncChangeSchema.options;
export const syncPushSchema = z.object({
  changes: z.array(z.discriminatedUnion('entity', changeOptions)).max(500),
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

  app.post('/sync', { preHandler: auth, bodyLimit: BODY_LIMIT }, async (req, reply) => {
    const id = participantId(req);
    const { changes } = syncPushSchema.parse(req.body);
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

    // O lock por participante serializa os pushes: os server_seq são atribuídos depois dele, então
    // um pull do mesmo participante nunca vê um seq menor commitado depois de um maior. O
    // `cursor` do POST é só informativo: o cliente avança o cursor de pull apenas pelo GET.
    const { applied, cursor } = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
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
        const row = await tx.syncRecord.aggregate({
          where: { participantId: id },
          _max: { serverSeq: true },
        });
        return { applied: count, cursor: (row._max.serverSeq ?? 0n).toString() };
      },
      { timeout: 30_000, maxWait: 5_000 },
    );

    return { applied, cursor };
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
