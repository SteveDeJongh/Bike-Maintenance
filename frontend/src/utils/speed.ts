// Backend stores/returns speed in meters/second (Strava's native unit); no
// metric/imperial setting exists anywhere in this app (see formatDistance),
// so this matches that same hardcoded-unit convention rather than inventing
// settings infrastructure neither file has.
export function formatSpeed(metersPerSecond: number): string {
  const kmh = metersPerSecond * 3.6
  return `${kmh.toLocaleString(undefined, { maximumFractionDigits: 1 })} km/h`
}
