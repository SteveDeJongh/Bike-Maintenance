// "+11%" / "-4%" for this year vs last year to date. null when there's
// nothing to compare against (previous is 0), so the tile shows no change
// rather than "+Infinity%".
export function formatPercentChange(current: number, previous: number): { text: string; up: boolean } | null {
  if (previous <= 0) return null

  const percent = Math.round(((current - previous) / previous) * 100)
  return { text: `${percent >= 0 ? '+' : '-'}${Math.abs(percent)}%`, up: percent >= 0 }
}
