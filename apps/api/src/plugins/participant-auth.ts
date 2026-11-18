import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { normalizeCode } from '@nexo/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../db';

declare module 'fastify' {
  interface FastifyRequest {
    participant?: { id: string; code: string };
  }
}

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

function derive(key: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p };
  return new Promise((resolve, reject) => {
    scrypt(key, salt, KEY_LEN, opts, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

export async function hashKey(key: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await derive(key, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Hash fixo para gastar o mesmo tempo quando o código não existe. */
const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(SALT_LEN).toString('base64')}$${Buffer.alloc(KEY_LEN).toString('base64')}`;

export async function verifyKey(key: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(key, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const header = (req: FastifyRequest, name: string): string | undefined => {
  const v = req.headers[name];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};

/** preHandler: exige `x-participant-code` + `x-participant-key` e preenche `request.participant`. */
export function requireParticipant(prisma: PrismaClient) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const rawCode = header(req, 'x-participant-code');
    const key = header(req, 'x-participant-key');
    const row =
      rawCode && key
        ? await prisma.participant.findUnique({ where: { code: normalizeCode(rawCode) } })
        : null;
    // Sempre roda o scrypt (com hash fixo se o código não existe) para não revelar quais códigos existem.
    const ok = await verifyKey(key ?? '', row?.keyHash ?? DUMMY_HASH);
    if (!row || !key || !ok) {
      return reply
        .status(401)
        .send({ error: 'unauthorized', message: 'Código ou chave do participante inválidos.' });
    }
    req.participant = { id: row.id, code: row.code };
  };
}
