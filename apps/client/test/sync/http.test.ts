import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiFetch, httpConfig } from '../../src/sync/http';

const fetchMock = vi.fn();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  httpConfig.retryDelaysMs = [0, 0, 0, 0, 0];
});
afterEach(() => vi.unstubAllGlobals());

const schema = z.object({ ok: z.boolean() });

describe('apiFetch', () => {
  it('429 e 5xx são retentados', async () => {
    fetchMock
      .mockResolvedValueOnce(json(429, { error: 'rate', message: 'm' }))
      .mockResolvedValueOnce(json(500, { error: 'x', message: 'm' }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiFetch('/v1/x', { schema })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('4xx não é retentado e traz status e code', async () => {
    fetchMock.mockResolvedValue(json(404, { error: 'invalid_code', message: 'm' }));
    await expect(apiFetch('/v1/x', { schema })).rejects.toMatchObject({
      status: 404,
      code: 'invalid_code',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('erro de rede esgota as tentativas e lança ApiError de rede', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'));
    const e = await apiFetch('/v1/x', { schema }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 0, code: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('aborta por timeout e trata como retentável', async () => {
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    httpConfig.retryDelaysMs = [0];
    const e = await apiFetch('/v1/x', { schema, timeoutMs: 10 }).catch((x: unknown) => x);
    expect(e).toMatchObject({ status: 0, code: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resposta fora do schema vira bad_response sem retry', async () => {
    fetchMock.mockResolvedValue(json(200, { nope: 1 }));
    await expect(apiFetch('/v1/x', { schema })).rejects.toMatchObject({ code: 'bad_response' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
