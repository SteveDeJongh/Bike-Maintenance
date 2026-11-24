import { describe, expect, it } from 'vitest'
import { rotationSummaryLine } from './rotation'
import type { RotationGroup } from './bikeCard'
import type { DashboardDisplayMetric, DashboardMountedComponent, DashboardOffBikeComponent } from '../types/models'

const wear = {
  fraction_used: null,
  driving_dimension: null,
  distance_remaining_meters: null,
  moving_time_remaining_seconds: null,
  days_remaining: null,
  total_distance_meters: null,
}

function metric(overrides: Partial<DashboardDisplayMetric> = {}): DashboardDisplayMetric {
  return { requirement_name: 'Wax', distance_meters: 196_000, moving_time_seconds: null, days: null, since_service_type_name: 'Wax', ...overrides }
}

function mounted(label: string): DashboardMountedComponent {
  return {
    component_id: 1,
    assignment_id: 1,
    label,
    category: 'chain',
    ride_context: 'both',
    service_status: 'ok',
    display_metric: metric(),
    ...wear,
  }
}

function off(label: string, overrides: Partial<DashboardOffBikeComponent> = {}): DashboardOffBikeComponent {
  return {
    component_id: 2,
    label,
    category: 'chain',
    rotates: true,
    service_status: 'ok',
    last_service_at: '2026-11-20T18:00:00Z',
    display_metric: metric({ distance_meters: 0 }),
    ...wear,
    ...overrides,
  }
}

const group = (offBike: DashboardOffBikeComponent[]): RotationGroup => ({ category: 'chain', mounted: [mounted('Chain S1')], offBike })

describe('rotationSummaryLine', () => {
  it('says what is on the bike and that the serviced spare is ready', () => {
    expect(rotationSummaryLine(group([off('Chain S2')]))).toBe(
      'On the bike: Chain S1 (196 km since Wax). Off: Chain S2, last wax Nov 20, ready.',
    )
  })

  it('flags a spare that is due or coming up', () => {
    expect(rotationSummaryLine(group([off('Chain S2', { service_status: 'due' })]))).toContain('Chain S2, last wax Nov 20, due.')
    expect(rotationSummaryLine(group([off('Chain S2', { service_status: 'warning' })]))).toContain('service soon.')
  })

  it('leaves out the date for a spare never serviced, and treats no requirement as ready', () => {
    const spare = off('Chain S3', { last_service_at: null, service_status: null, display_metric: metric({ since_service_type_name: null }) })
    expect(rotationSummaryLine(group([spare]))).toContain('Off: Chain S3, ready.')
  })

  it('lists several spares', () => {
    expect(rotationSummaryLine(group([off('Chain S2'), off('Chain S3', { service_status: 'due' })]))).toContain(
      'Off: Chain S2, last wax Nov 20, ready; Chain S3, last wax Nov 20, due.',
    )
  })
})
