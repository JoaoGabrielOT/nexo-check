import { completeOnboarding, expect, syncFromSettings, test } from './fixtures';

test('com consentimento, a observação do registro nunca vai para o servidor', async ({
  page,
  api,
}) => {
  await completeOnboarding(page, 'accept');
  await page.goto('/registro');
  await page.getByRole('radio', { name: '3 — Médio' }).click();
  await page.getByRole('radio', { name: '3 — Ok' }).click();
  await page.getByRole('radio', { name: '3 — Média' }).click();
  await page.getByRole('radio', { name: '3 — Regular' }).click();
  await page.getByLabel(/Observação/).fill('texto privado que não pode sair');
  await page.getByRole('button', { name: 'Salvar registro' }).click();
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Anotado' })).toBeVisible();

  await syncFromSettings(page);

  const logs = api.pushedChanges().filter((c) => c.entity === 'dailyLog');
  expect(logs.length).toBeGreaterThan(0);
  for (const log of logs) expect(log.payload.note).toBeNull();
  expect(JSON.stringify(api.requests.map((r) => r.body))).not.toContain('texto privado');
});
