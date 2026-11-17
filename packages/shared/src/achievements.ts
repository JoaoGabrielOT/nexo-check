import { lastNDateKeys } from './dates';
import { computeStreak } from './streak';

export type AchievementId =
  | 'first_full_day'
  | 'streak_3'
  | 'streak_7'
  | 'first_perfect_week'
  | 'breathing_10'
  | 'first_checkin'
  | 'initial_questionnaire';

export interface AchievementState {
  ratiosByDate: Record<string, number>;
  today: string;
  breathingSessions: number;
  confirmedCheckins: number;
  initialQuestionnaireDone: boolean;
}

const ids: AchievementId[] = [
  'first_full_day',
  'streak_3',
  'streak_7',
  'first_perfect_week',
  'breathing_10',
  'first_checkin',
  'initial_questionnaire',
];

export const ACHIEVEMENTS = Object.fromEntries(
  ids.map((id) => [
    id,
    { titleKey: `achievements.${id}.title`, descriptionKey: `achievements.${id}.description` },
  ]),
) as Record<AchievementId, { titleKey: string; descriptionKey: string }>;

/** 7 dias de calendário consecutivos com ratio 1, em qualquer ponto do histórico. */
function hasPerfectWeek(ratiosByDate: Record<string, number>): boolean {
  const perfect = Object.keys(ratiosByDate)
    .filter((k) => ratiosByDate[k] === 1)
    .sort();
  const set = new Set(perfect);
  return perfect.some((k) => lastNDateKeys(k, 7).every((d) => set.has(d)));
}

export function evaluateAchievements(s: AchievementState): AchievementId[] {
  const { best } = computeStreak(s.ratiosByDate, s.today);
  const earned: AchievementId[] = [];
  if (Object.values(s.ratiosByDate).some((r) => r === 1)) earned.push('first_full_day');
  if (best >= 3) earned.push('streak_3');
  if (best >= 7) earned.push('streak_7');
  if (hasPerfectWeek(s.ratiosByDate)) earned.push('first_perfect_week');
  if (s.breathingSessions >= 10) earned.push('breathing_10');
  if (s.confirmedCheckins >= 1) earned.push('first_checkin');
  if (s.initialQuestionnaireDone) earned.push('initial_questionnaire');
  return earned;
}
