import { PrismaPg } from '@prisma/adapter-pg';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { buildApp } from '../src/app';
import type { Env } from '../src/env';
import { PrismaClient } from '../src/generated/prisma/client';
import { clearParticipantAuthCache } from '../src/plugins/participant-auth';

export const testEnv: Env = {
  DATABASE_URL: '',
  ADMIN_PASSWORD: 'senha-admin-de-teste',
  ADMIN_JWT_SECRET: 'segredo-jwt-de-teste-com-32-caracteres-ou-mais',
  CORS_ORIGINS: ['https://nexo.example'],
  PUBLIC_WEB_URL: 'https://nexo.example',
  PORT: 3333,
  TRUST_PROXY_HOPS: 1,
  NODE_ENV: 'test',
};

export async function makeTestApp(
  overrides: Partial<Env> = {},
  rateLimitMax?: number,
  loginLimitMax?: number,
): Promise<{ app: FastifyInstance; prisma: PrismaClient; reset: () => Promise<void> }> {
  const databaseUrl = inject('databaseUrl');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const app = await buildApp({
    prisma,
    env: { ...testEnv, DATABASE_URL: databaseUrl, ...overrides },
    ...(rateLimitMax ? { rateLimitMax } : {}),
    ...(loginLimitMax ? { loginLimitMax } : {}),
  });
  const reset = async () => {
    clearParticipantAuthCache(prisma);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE participants, sync_records, questionnaire_responses, workshop_sessions, checkins RESTART IDENTITY CASCADE',
    );
  };
  return { app, prisma, reset };
}
