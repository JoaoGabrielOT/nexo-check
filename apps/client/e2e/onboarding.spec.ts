import { completeOnboarding, expect, syncFromSettings, test } from './fixtures';

const APP_ORIGIN = 'http://localhost:4173';

test('aceitar o consentimento mostra o código e a chave de participante', async ({ page, api }) => {
  const code = await completeOnboarding(page, 'accept');
  expect(code).toMatch(/^NEXO-[0-9A-Z]{4}$/);
  await expect(page).toHaveURL('/');
  // O registro no servidor acontece depois do consentimento, na primeira sincronização.
  await syncFromSettings(page);
  expect(api.received('POST /v1/participants')).toHaveLength(1);
});

test('recusar o consentimento não envia nada ao servidor durante todo o uso', async ({
  page,
  api,
}) => {
  // Toda requisição para fora da origem do app (inclui uma origem de API errada).
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== APP_ORIGIN) external.push(request.url());
  });
  await completeOnboarding(page, 'decline');
  await page.getByRole('button', { name: /Adicionar 10 minutos/ }).click();
  await page.goto('/registro');
  await page.goto('/progresso');
  await page.goto('/projeto');
  await page.goto('/config');
  await expect(page.getByText('Sincronização ainda não configurada neste aparelho.')).toBeVisible();
  // Espera mais que o debounce das escritas locais (LOCAL_WRITE_DEBOUNCE_MS = 5000 em
  // src/sync/engine.ts, não exportado: se mudar lá, ajustar aqui) para uma sincronização disparar.
  await page.waitForTimeout(6000);
  expect(api.requests).toEqual([]);
  expect(external).toEqual([]);
});
