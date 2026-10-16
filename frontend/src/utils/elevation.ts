export function formatElevation(meters: number): string {
  return `${Math.round(meters).toLocaleString()} m`
}
