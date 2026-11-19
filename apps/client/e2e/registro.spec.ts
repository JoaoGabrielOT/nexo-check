import { completeOnboarding, expect, test } from './fixtures';

test('preencher as quatro escalas e salvar mostra a mensagem na região ao vivo', async ({
  page,
}) => {
  await completeOnboarding(page, 'decline');
  await page.goto('/registro');

  await page.getByRole('radio', { name: '2 — Baixo' }).click(); // estresse
  await page.getByRole('radio', { name: '4 — Bem' }).click(); // humor
  await page.getByRole('radio', { name: '4 — Alta' }).click(); // disposição
  await page.getByRole('radio', { name: '4 — Boa' }).click(); // sono

  await page.getByRole('button', { name: 'Salvar registro' }).click();
  const live = page.locator('[aria-live="polite"]').filter({ hasText: 'dia mais leve' });
  await expect(live).toBeVisible();
});

test('o botão de salvar só habilita com as quatro escalas respondidas', async ({ page }) => {
  await completeOnboarding(page, 'decline');
  await page.goto('/registro');
  const save = page.getByRole('button', { name: 'Salvar registro' });
  await expect(save).toBeDisabled();
  await page.getByRole('radio', { name: '3 — Médio' }).click();
  await expect(save).toBeDisabled();
});
