// Backend stores/returns distances in meters (Strava's native unit); this
// is the one place that converts for display.
export function formatDistance(meters: number): string {
  const km = meters / 1000
  return `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`
}
