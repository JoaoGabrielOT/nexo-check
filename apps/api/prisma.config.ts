import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Carrega o .env local para os scripts db:* (no Render as variáveis já vêm do ambiente).
if (existsSync('.env')) process.loadEnvFile('.env');

// Migrações usam a conexão direta (sem pooler) quando existir; `||` trata DIRECT_URL vazia.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || '' },
});
