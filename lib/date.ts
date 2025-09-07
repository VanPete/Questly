// Central helper for the app's business day (America/New_York)
// Use this for streaks, daily progress, leaderboards, rotations, etc.
// Returns a YYYY-MM-DD string representing the date in the target timezone.
export function businessDate(tz: string = 'America/New_York'): string {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}
