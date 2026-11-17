import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

// Sobe um Postgres embarcado (porta livre, diretório temporário), aplica as migrações
// e expõe a URL via process.env e provide().
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const dataDir = mkdtempSync(join(tmpdir(), 'nexo-pg-'));
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });

  const cleanup = async () => {
    await pg.stop().catch(() => {});
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };

  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('nexo_test');
    const url = `postgresql://postgres:postgres@127.0.0.1:${port}/nexo_test`;
    process.env.DATABASE_URL = url;
    delete process.env.DIRECT_URL;
    execSync('pnpm exec prisma migrate deploy', {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
    });
    project.provide('databaseUrl', url);
  } catch (err) {
    await cleanup();
    throw err;
  }

  return cleanup;
}
