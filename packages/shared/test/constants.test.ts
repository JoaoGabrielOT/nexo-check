import { STREAK_THRESHOLD, CONSENT_VERSION, SYNC_RETRY_DELAYS_MS } from '../src';
test('constantes do design', () => {
  expect(STREAK_THRESHOLD).toBe(0.5);
  expect(CONSENT_VERSION).toBe(1);
  expect(SYNC_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000]);
});
