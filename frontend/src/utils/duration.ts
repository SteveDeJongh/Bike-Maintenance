// Backend stores/returns moving time in seconds (Strava's native unit); this
// is the one place that converts for display.
export function formatDuration(seconds: number): string {
  const hours = seconds / 3600
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`
}
