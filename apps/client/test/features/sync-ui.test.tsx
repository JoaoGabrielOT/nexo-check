import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncStatusPill } from '../../src/app/SyncStatusPill';
import { db, getSettings, outboxCount, updateSettings } from '../../src/db';
import { resetDbForTests } from '../../src/db/db';
import { SyncSection } from '../../src/features/settings/SyncSection';
import { httpConfig } from '../../src/sync/http';

const KEY = 'K'.repeat(24);
const NOW = '2026-11-18T10:00:00.000Z';
const fetchMock = vi.fn();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function consent() {
  await updateSettings({
    consent: { granted: true, version: 1, at: NOW },
    participant: { code: 'NEXO-ABCD', key: KEY, registered: true },
    consentSyncedVersion: 1,
  });
}

beforeEach(async () => {
  await resetDbForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  httpConfig.retryDelaysMs = [0];
});
afterEach(() => vi.unstubAllGlobals());

describe('indicador de sincronização', () => {
  it('fica oculto sem consentimento', async () => {
    render(<SyncStatusPill />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mostra Sincronizado e depois Pendente: N com itens no outbox', async () => {
    await consent();
    render(<SyncStatusPill />);
    expect(await screen.findByRole('status')).toHaveTextContent('Sincronizado');
    await db.outbox.bulkAdd([
      { entity: 'habit', entityId: '1', change: {} as never },
      { entity: 'habit', entityId: '2', change: {} as never },
    ]);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Pendente: 2'));
  });
});

describe('SyncSection', () => {
  const renderSection = () =>
    render(
      <MemoryRouter>
        <SyncSection />
      </MemoryRouter>,
    );

  it('revogar consentimento esvazia o outbox e remove o consentimento', async () => {
    const user = userEvent.setup();
    await consent();
    await db.outbox.add({ entity: 'habit', entityId: '1', change: {} as never });
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Revogar consentimento' }));
    await user.click(await screen.findByRole('button', { name: 'Revogar e manter no servidor' }));
    await waitFor(async () => expect((await getSettings()).consent).toBeNull());
    expect(await outboxCount()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restaurar mostra erro com credenciais incorretas e funciona com as corretas', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Restaurar em outro aparelho' }));
    await user.type(await screen.findByLabelText('Código de participante'), 'nexo-wxyz');
    await user.type(screen.getByLabelText('Chave de recuperação'), KEY);

    fetchMock.mockResolvedValueOnce(json(401, { error: 'unauthorized', message: 'x' }));
    await user.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código ou chave incorretos.');

    fetchMock.mockResolvedValueOnce(json(200, { changes: [], cursor: '3', hasMore: false }));
    await user.click(screen.getByRole('button', { name: 'Restaurar' }));
    await waitFor(async () =>
      expect((await getSettings()).participant).toEqual({
        code: 'NEXO-WXYZ',
        key: KEY,
        registered: true,
      }),
    );
  });
});
