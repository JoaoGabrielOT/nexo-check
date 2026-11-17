import { nextProgressiveTarget } from '../src/progressive';

const t = true;
const f = false;

describe('nextProgressiveTarget', () => {
  test('sobe um passo com 5 de 7', () => {
    expect(nextProgressiveTarget(10, [t, t, t, t, t, f, f], 30)).toBe(15);
  });
  test('mantém com 4 de 7', () => {
    expect(nextProgressiveTarget(10, [t, t, t, t, f, f, f], 30)).toBe(10);
  });
  test('não passa do teto', () => {
    expect(nextProgressiveTarget(30, [t, t, t, t, t, t, t], 30)).toBe(30);
    expect(nextProgressiveTarget(28, [t, t, t, t, t, t, t], 30)).toBe(30);
  });
});
