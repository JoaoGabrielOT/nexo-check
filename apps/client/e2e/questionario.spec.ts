import { readFileSync } from 'node:fs';
import { completeOnboarding, expect, test } from './fixtures';

interface Question {
  options: { value: string; label: string }[];
  correct: string;
}

const educativo = JSON.parse(
  readFileSync(
    new URL('../../../packages/shared/content/questionnaires/educativo.json', import.meta.url),
    'utf-8',
  ),
) as { questions: Question[] };

test('questionário educativo mostra a nota em porcentagem', async ({ page }) => {
  await completeOnboarding(page, 'decline');
  await page.goto('/projeto/questionario/educativo');
  await page.getByRole('button', { name: 'Começar' }).click();

  // Padrão conhecido: acerta as duas primeiras e erra as demais.
  const { questions } = educativo;
  const hits = 2;
  for (const [i, q] of questions.entries()) {
    const pick = q.options.find((o) => (i < hits ? o.value === q.correct : o.value !== q.correct));
    await page.getByRole('radio', { name: pick?.label, exact: true }).click();
    await page.getByRole('button', { name: 'Avançar' }).click();
  }
  await page.getByRole('button', { name: 'Salvar respostas' }).click();

  const percent = Math.floor((hits * 100) / questions.length);
  await expect(page.getByText(`${percent}%`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${hits} de ${questions.length} respostas certas`)).toBeVisible();
});
