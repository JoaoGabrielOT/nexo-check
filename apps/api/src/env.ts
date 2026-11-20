import { z } from 'zod';

// Variável vazia (`FOO=` no .env) conta como ausente.
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    ADMIN_PASSWORD: z.string().min(12),
    ADMIN_JWT_SECRET: z.string().min(32),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim().replace(/\/+$/, ''))
          .filter(Boolean),
      ),
    PUBLIC_WEB_URL: z.url(),
    PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(3333)),
    // Saltos de proxy confiáveis para X-Forwarded-For (Render = 1).
    TRUST_PROXY_HOPS: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(0).max(10).default(1),
    ),
    // Cabeçalho com o IP real do cliente (ex.: cf-connecting-ip), usado como chave do rate limit.
    // Vazio = usa o IP resolvido pelo trustProxy.
    CLIENT_IP_HEADER: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .min(1)
        .transform((v) => v.toLowerCase())
        .optional(),
    ),
    NODE_ENV: z.preprocess(
      emptyToUndefined,
      z.enum(['development', 'test', 'production']).default('development'),
    ),
  })
  .superRefine((env, ctx) => {
    // Sem origens o navegador bloqueia o app web inteiro: falha no boot, não em silêncio.
    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'obrigatório em produção (origens separadas por vírgula)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Variáveis de ambiente inválidas: ${issues}`);
  }
  return result.data;
}
