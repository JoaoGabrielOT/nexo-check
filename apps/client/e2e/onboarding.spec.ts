import { completeOnboarding, expect, syncFromSettings, test } from './fixtures';

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
  await completeOnboarding(page, 'decline');
  await page.getByRole('button', { name: /Adicionar 10 minutos/ }).click();
  await page.goto('/registro');
  await page.goto('/progresso');
  await page.goto('/projeto');
  await page.goto('/config');
  await expect(page.getByText('Sincronização ainda não configurada neste aparelho.')).toBeVisible();
  // Dá tempo ao ciclo de sincronização por escrita (debounce de 5 s) de disparar, se existisse.
  await page.waitForTimeout(6000);
  expect(api.requests).toEqual([]);
});
