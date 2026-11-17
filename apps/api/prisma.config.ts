import { defineConfig } from 'prisma/config';

// Migrações usam a conexão direta (sem pooler) quando existir.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
});
