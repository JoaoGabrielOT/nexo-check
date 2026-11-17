import { ACHIEVEMENTS, evaluateAchievements, type AchievementState } from '../src/achievements';
import { lastNDateKeys } from '../src/dates';

const base = (over: Partial<AchievementState>): AchievementState => ({
  ratiosByDate: {},
  today: '2026-03-07',
  breathingSessions: 0,
  confirmedCheckins: 0,
  initialQuestionnaireDone: false,
  ...over,
});

describe('evaluateAchievements', () => {
  test('7 dias perfeitos', () => {
    const ratiosByDate = Object.fromEntries(lastNDateKeys('2026-03-07', 7).map((k) => [k, 1]));
    const got = evaluateAchievements(base({ ratiosByDate }));
    expect(got).toEqual(
      expect.arrayContaining(['first_full_day', 'streak_3', 'streak_7', 'first_perfect_week']),
    );
  });
  test('semana perfeita atravessando virada de m�s', () => {
    const ratiosByDate = Object.fromEntries(lastNDateKeys('2026-03-03', 7).map((k) => [k, 1]));
    expect(ratiosByDate).toHaveProperty('2026-02-25');
    const got = evaluateAchievements(base({ ratiosByDate, today: '2026-03-03' }));
    expect(got).toContain('first_perfect_week');
  });
  test('uma semana com um dia 0.9 não é perfeita', () => {
    const keys = lastNDateKeys('2026-03-07', 7);
    const ratiosByDate = Object.fromEntries(keys.map((k, i) => [k, i === 3 ? 0.9 : 1]));
    const got = evaluateAchievements(base({ ratiosByDate }));
    expect(got).toContain('first_full_day');
    expect(got).not.toContain('first_perfect_week');
  });
  test('respiração, check-in e questionário', () => {
    expect(evaluateAchievements(base({ breathingSessions: 10 }))).toContain('breathing_10');
    expect(evaluateAchievements(base({ breathingSessions: 9 }))).not.toContain('breathing_10');
    expect(evaluateAchievements(base({ confirmedCheckins: 1 }))).toContain('first_checkin');
    expect(evaluateAchievements(base({ initialQuestionnaireDone: true }))).toContain(
      'initial_questionnaire',
    );
  });
  test('nada', () => {
    expect(evaluateAchievements(base({}))).toEqual([]);
  });
  test('ACHIEVEMENTS tem chaves i18n', () => {
    expect(ACHIEVEMENTS.streak_3).toEqual({
      titleKey: 'achievements.streak_3.title',
      descriptionKey: 'achievements.streak_3.description',
    });
  });
});
