import { PROGRESSIVE_DAYS_REQUIRED, PROGRESSIVE_STEP } from './constants';

export function nextProgressiveTarget(
  currentTarget: number,
  last7Met: boolean[],
  ceiling: number,
): number {
  if (currentTarget >= ceiling) return currentTarget;
  const met = last7Met.filter(Boolean).length;
  if (met < PROGRESSIVE_DAYS_REQUIRED) return currentTarget;
  return Math.min(currentTarget + PROGRESSIVE_STEP, ceiling);
}
