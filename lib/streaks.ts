import { differenceInCalendarDays } from 'date-fns';

export function nextStreakCount(lastActive: Date | null, currentCount: number) {
  if (!lastActive) return Math.max(1, currentCount || 0);
  const days = differenceInCalendarDays(new Date(), lastActive);
  if (days === 0) return currentCount; // already counted today
  if (days === 1) return currentCount + 1; // consecutive day
  return 1; // reset streak
}
