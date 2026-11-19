import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminRoutes from '../../src/features/admin/AdminRoutes';
import { httpConfig } from '../../src/sync/http';

const download = vi.fn();
vi.mock('../../src/platform/files', () => ({ downloadFile: (...a: unknown[]) => download(...a) }));

const TOKEN_KEY = 'nexo-admin-token';
const fetchMock = vi.fn();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const indicator = (id: string, extra: object = {}) => ({
  id,
  value: '—',
  target: 'meta',
  status: 'below',
  n: 12,
  smallSample: false,
  ...extra,
});
const stats = {
  indicators: [
    indicator('participation', {
      value: '24',
      target: '20–30 estudantes',
      status: 'met',
      detail: { checkins: 20, manual: 4 },
    }),
    indicator('comprehension', { value: '85%', status: 'met' }),
    indicator('acceptance', { value: '70%', n: 6, smallSample: true }),
    indicator('adherence', { value: '60%', status: 'met', detail: { checklistMovement: 0.449 } }),
    indicator('stress', { value: 'antes 4,0 → depois 2,5', status: 'comparison' }),
    indicator('activity_frequency', { value: 'antes 1,0 → depois 3,0', status: 'comparison' }),
  ],
  generatedAt: '2026-11-19T13:45:00.000Z',
  totals: { participants: 30, sessions: 2 },
};
const session = {
  id: 's1',
  workshop: 1,
  date: '2026-11-20',
  location: 'Sala 12',
  code: 'ABC234',
  checkinUrl: 'https://nexo.example/checkin?c=ABC234',
  expiresAt: '2026-11-22T02:59:59.999Z',
  checkins: 0,
  manualCount: 0,
};

/** Responde por método + caminho; o que não estiver no mapa falha o teste. */
function routeFetch(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`rota não mockada: ${key}`);
    return Promise.resolve(handler());
  });
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  download.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  httpConfig.retryDelaysMs = [];
});
afterEach(() => vi.unstubAllGlobals());

async function login() {
  const user = userEvent.setup();
  render(<AdminRoutes />);
  await user.type(await screen.findByLabelText('Senha'), 'segredo');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

describe('painel admin', () => {
  it('login com 401 mostra o erro e não guarda token', async () => {
    routeFetch({
      'POST /v1/admin/login': () =>
        json(401, { error: 'unauthorized', message: 'Senha incorreta.' }),
    });
    await login();
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta');
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('login com 429 mostra "Muitas tentativas" na hora, com uma única chamada', async () => {
    httpConfig.retryDelaysMs = [0, 0];
    routeFetch({
      'POST /v1/admin/login': () => json(429, { error: 'rate_limited', message: 'Calma.' }),
    });
    await login();
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('criar sessão com 503 não retenta (sem sessões duplicadas) e mostra o erro', async () => {
    httpConfig.retryDelaysMs = [0, 0];
    sessionStorage.setItem(TOKEN_KEY, 'tok');
    routeFetch({
      'GET /v1/admin/stats': () => json(200, stats),
      'GET /v1/admin/sessions': () => json(200, []),
      'POST /v1/admin/sessions': () => json(503, { error: 'unavailable', message: 'Fora do ar.' }),
    });
    const user = userEvent.setup();
    render(<AdminRoutes />);
    await user.click(await screen.findByRole('tab', { name: 'Sessões' }));
    await user.type(await screen.findByLabelText('Local'), 'Sala 12');
    await user.click(screen.getByRole('button', { name: 'Criar sessão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível criar a sessão');
    const posts = fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST');
    expect(posts).toHaveLength(1);
  });

  it('login com sucesso guarda o token só no sessionStorage e abre os indicadores', async () => {
    routeFetch({
      'POST /v1/admin/login': () => json(200, { token: 'tok-123' }),
      'GET /v1/admin/stats': () => json(200, stats),
    });
    await login();
    expect(await screen.findByRole('region', { name: 'Participação' })).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('tok-123');
    expect(localStorage.length).toBe(0);
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/stats')) as [
      string,
      RequestInit,
    ];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok-123');
  });

  it('qualquer 401 limpa o token e volta para o login', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'velho');
    routeFetch({
      'GET /v1/admin/stats': () => json(401, { error: 'unauthorized', message: 'Expirou.' }),
    });
    render(<AdminRoutes />);
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('criar sessão mostra o código e o QR com texto alternativo', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok');
    let created = false;
    routeFetch({
      'GET /v1/admin/stats': () => json(200, stats),
      'GET /v1/admin/sessions': () => json(200, created ? [session] : []),
      'POST /v1/admin/sessions': () => {
        created = true;
        return json(201, session);
      },
    });
    const user = userEvent.setup();
    render(<AdminRoutes />);
    await user.click(await screen.findByRole('tab', { name: 'Sessões' }));
    await user.type(await screen.findByLabelText('Local'), 'Sala 12');
    await user.click(screen.getByRole('radio', { name: 'Oficina 1' }));
    const date = screen.getByLabelText('Data');
    await user.clear(date);
    await user.type(date, '2026-11-20');
    await user.click(screen.getByRole('button', { name: 'Criar sessão' }));
    expect(await screen.findByText('ABC234')).toBeInTheDocument();
    expect(
      await screen.findByRole('img', { name: 'QR code de check-in da oficina 1 em 20/11' }),
    ).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST') as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(post[1].body as string)).toEqual({
      workshop: 1,
      date: '2026-11-20',
      location: 'Sala 12',
    });
  });

  it('excluir fica desabilitado quando há check-ins', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok');
    routeFetch({
      'GET /v1/admin/stats': () => json(200, stats),
      'GET /v1/admin/sessions': () => json(200, [{ ...session, checkins: 3 }]),
    });
    const user = userEvent.setup();
    render(<AdminRoutes />);
    await user.click(await screen.findByRole('tab', { name: 'Sessões' }));
    expect(await screen.findByRole('button', { name: 'Excluir sessão' })).toBeDisabled();
  });

  it('card de participação com status met mostra "Meta atingida" e o detalhe', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok');
    routeFetch({ 'GET /v1/admin/stats': () => json(200, stats) });
    render(<AdminRoutes />);
    const card = await screen.findByRole('region', { name: 'Participação' });
    expect(within(card).getByText('Meta atingida')).toBeInTheDocument();
    expect(within(card).getByText(/20 check-ins/)).toBeInTheDocument();
    expect(within(card).getByText(/4 manuais/)).toBeInTheDocument();
    const adherence = screen.getByRole('region', { name: 'Adesão ao movimento' });
    expect(within(adherence).getByText(/44%/)).toBeInTheDocument();
    const acceptance = screen.getByRole('region', { name: 'Aceitação' });
    expect(within(acceptance).getByText('Abaixo da meta')).toBeInTheDocument();
    expect(within(acceptance).getByText(/amostra pequena \(n < 10\)/)).toBeInTheDocument();
  });

  it('card de estresse mostra antes → depois, sem status de meta', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok');
    routeFetch({ 'GET /v1/admin/stats': () => json(200, stats) });
    render(<AdminRoutes />);
    const card = await screen.findByRole('region', { name: 'Estresse e bem-estar' });
    expect(within(card).getByText(/antes 4,0 → depois 2,5/)).toBeInTheDocument();
    expect(within(card).queryByText(/Meta atingida|Abaixo da meta/)).toBeNull();
    expect(within(card).getByText('Comparação (sem meta)')).toBeInTheDocument();
  });

  it('Exportar CSV baixa com o token e o nome enviado pelo servidor', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok');
    routeFetch({
      'GET /v1/admin/stats': () => json(200, stats),
      'GET /v1/admin/export.csv': () =>
        new Response('codigo;x', {
          status: 200,
          headers: {
            'content-type': 'text/csv',
            'content-disposition': 'attachment; filename="nexo-indicadores-2026-11-20.csv"',
          },
        }),
    });
    const user = userEvent.setup();
    render(<AdminRoutes />);
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(download.mock.calls[0]?.[0]).toBe('nexo-indicadores-2026-11-20.csv');
    const csv = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/export.csv')) as [
      string,
      RequestInit,
    ];
    expect(new Headers(csv[1].headers).get('authorization')).toBe('Bearer tok');
  });
});
