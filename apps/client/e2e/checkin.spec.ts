import { completeOnboarding, expect, syncFromSettings, test } from './fixtures';

test('check-in pelo link do QR fica pendente e é confirmado depois da sincronização', async ({
  page,
  api,
}) => {
  api.seedSession('ABC234');
  await completeOnboarding(page, 'accept');
  // Registra o participante já agora, sem depender do debounce de 5 s das escritas.
  await syncFromSettings(page);
  expect(api.received('POST /v1/participants')).toHaveLength(1);

  api.holdCheckins();
  await page.goto('/checkin?c=ABC234');
  await expect(page.getByLabel('Código da oficina')).toHaveValue('ABC234');
  await page.getByRole('button', { name: 'Confirmar presença' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Presença registrada' })).toBeVisible();
  await expect(page.getByText('Pendente', { exact: true })).toBeVisible();

  api.releaseCheckins();
  await expect(page.getByText('Confirmado', { exact: true })).toBeVisible();
  expect(api.received('POST /v1/checkins')).toHaveLength(1);
});

test('sem consentimento o check-in pede a participação e não grava nada', async ({ page, api }) => {
  await completeOnboarding(page, 'decline');
  await page.goto('/checkin?c=ABC234');
  await expect(page.getByText('Presença depende da pesquisa')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar presença' })).toHaveCount(0);
  expect(api.requests).toEqual([]);
});
