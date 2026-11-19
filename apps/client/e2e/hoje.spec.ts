import { completeOnboarding, expect, test } from './fixtures';

test('movimento soma blocos e a água conta copos', async ({ page }) => {
  await completeOnboarding(page, 'decline');

  const movement = page.getByRole('region', { name: 'Movimento do dia' });
  const add10 = page.getByRole('button', { name: /Adicionar 10 minutos/ });
  await add10.click();
  await add10.click();
  await expect(movement.getByText('20', { exact: true })).toBeVisible();

  const addCup = page.getByRole('button', { name: 'Adicionar um copo' });
  for (let i = 0; i < 3; i++) await addCup.click();
  await expect(page.getByRole('region', { name: 'Hidratação' }).getByText('3/8')).toBeVisible();

  // Os valores continuam depois de recarregar (ficam no aparelho).
  await page.reload();
  await expect(page.getByRole('region', { name: 'Hidratação' }).getByText('3/8')).toBeVisible();
});
