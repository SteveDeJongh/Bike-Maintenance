import { formatDisplayMetric, type RotationGroup } from './bikeCard'
import type { DashboardOffBikeComponent } from '../types/models'

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// "Chain S2, last wax Nov 20, ready". The service name stays as the user
// typed it ("last wax", not "waxed": types are free text, so a past tense
// can't be built reliably). Ready means nothing is due or coming up.
function offBikePhrase(component: DashboardOffBikeComponent): string {
  const parts = [component.label]
  const service = component.display_metric.since_service_type_name
  if (component.last_service_at) {
    parts.push(service ? `last ${service.toLowerCase()} ${shortDate(component.last_service_at)}` : `serviced ${shortDate(component.last_service_at)}`)
  }
  parts.push(component.service_status === 'due' ? 'due' : component.service_status === 'warning' ? 'service soon' : 'ready')
  return parts.join(', ')
}

// The rotation card's dimmed line: "On the bike: Chain S1 (196 km since
// wax). Off: Chain S2, last wax Nov 20, ready."
export function rotationSummaryLine(group: RotationGroup): string {
  const on = group.mounted.map((component) => `${component.label} (${formatDisplayMetric(component.display_metric)})`).join(', ')
  const off = group.offBike.map(offBikePhrase).join('; ')
  return `On the bike: ${on}. Off: ${off}.`
}
