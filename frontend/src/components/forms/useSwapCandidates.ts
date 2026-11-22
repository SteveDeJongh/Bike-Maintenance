import { useComponents, useComponentsDetails } from '../../api/queries'
import { SERVICE_STATUS_SEVERITY } from '../../constants'
import { formatDistance } from '../../utils/distance'
import { formatRemaining } from '../../utils/serviceInterval'
import { swapCandidates } from '../../utils/swapCandidates'
import type { ComponentDetail } from '../../types/models'

// The eligible replacements for a slot (swapCandidates) plus a caption per
// candidate -- "Last on {bike}" when it has one, its lifetime total, and
// its worst enabled requirement's remaining. Shared by SwapComponentModal
// and RetireComponentModal. Each candidate's detail is fetched for the
// caption; that's the handful of same-category components, not a list.
export function useSwapCandidates(category: string, currentComponentId: number) {
  const { data: components } = useComponents()
  const eligible = swapCandidates(components ?? [], category, currentComponentId)
  const detailQueries = useComponentsDetails(eligible.map((c) => c.id))
  const detailsById = new Map<number, ComponentDetail>(
    detailQueries.filter((q) => q.data).map((q) => [q.data!.id, q.data!]),
  )

  function captionFor(id: number): string | undefined {
    const parts: string[] = []
    const lastBike = eligible.find((c) => c.id === id)?.last_bike
    if (lastBike) parts.push(`Last on ${lastBike.name}`)

    const detail = detailsById.get(id)
    if (detail) {
      parts.push(`Total ${formatDistance(detail.total_distance)}`)
      const worst = [...detail.service_requirements]
        .filter((r) => r.enabled)
        .sort((a, b) => SERVICE_STATUS_SEVERITY[b.status] - SERVICE_STATUS_SEVERITY[a.status])[0]
      if (worst) {
        const remaining = formatRemaining(worst.distance_remaining_meters, worst.days_remaining, worst.moving_time_remaining_seconds)
        if (remaining) parts.push(`${worst.requirement_name}: ${remaining}`)
      }
    }
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  const options = eligible.map((c) => ({ value: String(c.id), label: c.label }))

  return { eligible, options, captionFor }
}
