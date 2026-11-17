import { compareSemver } from '../src/semver';

describe('compareSemver', () => {
  test('ignora prefixo v', () => expect(compareSemver('v0.1.0', '0.1.0')).toBe(0));
  test('compara numericamente', () => expect(compareSemver('0.2.0', '0.10.0')).toBe(-1));
  test('maior', () => expect(compareSemver('1.0.0', '0.9.9')).toBe(1));
  test('ignora pré-release', () => expect(compareSemver('1.0.0-beta.1', '1.0.0')).toBe(0));
});
