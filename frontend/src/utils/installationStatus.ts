// The one rule for what an installation is now (docs/frontend-ui.md,
// "Component page"):
// - current: still open, on a bike that isn't retired;
// - retired_bike: still open, but on a retired bike -- retiring a bike
//   leaves its parts installed (it usually went with them), so the stint
//   stays open without being "Current";
// - past: ended.
export type InstallationStatus = 'current' | 'retired_bike' | 'past'

export function installationStatus(
  assignment: { ended_at: string | null },
  bike: { retired_on?: string | null } | null | undefined,
): InstallationStatus {
  if (assignment.ended_at) return 'past'
  return bike?.retired_on ? 'retired_bike' : 'current'
}

const RANK: Record<InstallationStatus, number> = { current: 0, retired_bike: 1, past: 2 }

// Installation history's order: current ones, then those left on retired
// bikes, then past ones; each group keeps the given (newest-first) order.
export function sortInstallations<T extends { ended_at: string | null; bike: { retired_on?: string | null } }>(installations: readonly T[]): T[] {
  return installations
    .map((installation, index) => ({ installation, index }))
    .sort(
      (a, b) =>
        RANK[installationStatus(a.installation, a.installation.bike)] - RANK[installationStatus(b.installation, b.installation.bike)] ||
        a.index - b.index,
    )
    .map(({ installation }) => installation)
}
