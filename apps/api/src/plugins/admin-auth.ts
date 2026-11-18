import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Valor de `sub` do único usuário admin. */
export const ADMIN_SUBJECT = 'admin';

/** Registra o `@fastify/jwt` com o segredo do admin (`app.jwt.sign` / `req.jwtVerify`). */
export async function registerAdminJwt(app: FastifyInstance, secret: string): Promise<void> {
  await app.register(fastifyJwt, { secret });
}

/** preHandler: exige JWT válido emitido por `/admin/login` (`sub === 'admin'`), senão 401. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const payload = await req.jwtVerify<{ sub?: string }>();
    if (payload.sub === ADMIN_SUBJECT) return;
  } catch {
    // cai no 401 abaixo
  }
  return reply
    .status(401)
    .send({ error: 'unauthorized', message: 'Acesso restrito à administração.' });
}
