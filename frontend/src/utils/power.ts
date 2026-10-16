// nil means the bike has no device-metered (real power meter) activities —
// show "N/A" rather than a misleading "0 W".
export function formatPower(watts: number | null): string {
  if (watts === null) return 'N/A'
  return `${watts} W`
}
