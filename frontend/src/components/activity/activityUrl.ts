import { ACTIVITY_UI_KINDS } from '../../constants'
import type { ActivityUiKind } from '../../types/models'

// Activity's link-in filters: /activity?bike_id=12&kinds=ride. The page
// reads them once, on mount, as starting values (a link's kinds aren't
// saved to the preference unless a pill is then toggled).
export interface ActivityUrlFilters {
  bikeId?: number
  kinds?: ActivityUiKind[]
}

export function activityUrl({ bikeId, kinds }: ActivityUrlFilters): string {
  const params = new URLSearchParams()
  if (bikeId != null) params.set('bike_id', String(bikeId))
  if (kinds && kinds.length > 0) params.set('kinds', kinds.join(','))
  const query = params.toString()
  return query ? `/activity?${query}` : '/activity'
}

// The reverse, ignoring anything malformed (a non-numeric bike id, unknown
// kinds); no usable kinds means "use the saved ones".
export function parseActivityUrl(params: URLSearchParams): ActivityUrlFilters {
  const bikeId = Number(params.get('bike_id'))
  const kinds = (params.get('kinds') ?? '')
    .split(',')
    .filter((kind): kind is ActivityUiKind => (ACTIVITY_UI_KINDS as readonly string[]).includes(kind))

  return {
    bikeId: Number.isInteger(bikeId) && bikeId > 0 ? bikeId : undefined,
    kinds: kinds.length > 0 ? [...new Set(kinds)] : undefined,
  }
}
