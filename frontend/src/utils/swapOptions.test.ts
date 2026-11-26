import { describe, expect, it } from 'vitest'
import { canTakeComponent, emptyOptionLabel, orderSwapOptions, swapOptions, swapOptionStatus, type SwapSlot } from './swapOptions'
import type { ComponentCurrentBike, ComponentLastBike, ComponentWithServiceStatus } from '../types/models'

function component(
  id: number,
  extra: {
    category?: string
    retired_on?: string | null
    effectively_retired?: boolean
    current_bikes?: ComponentCurrentBike[]
    last_bike?: ComponentLastBike | null
    label?: string
  } = {},
): ComponentWithServiceStatus {
  return {
    id, label: extra.label ?? `C${id}`, category: extra.category ?? 'cassette', acquired_on: '2026-01-01',
    retired_on: extra.retired_on ?? null, brand: null, model: null, notes: null, service_status: null,
    current_bikes: extra.current_bikes ?? [], last_bike: extra.last_bike ?? null,
    effectively_retired: extra.effectively_retired ?? Boolean(extra.retired_on), effective_retired_on: extra.retired_on ?? null,
  }
}

const indoorOn = (id: number, name = `Bike ${id}`): ComponentCurrentBike => ({ id, name, ride_context: 'indoor_only' })
const slot = (rideContext: SwapSlot['rideContext'], bikeId = 3): SwapSlot => ({
  assignmentId: 1, bikeId, componentId: 100, category: 'cassette', rideContext,
})
const ids = (options: ReturnType<typeof swapOptions>) => options.map((o) => o.component.id)

describe('swapOptions', () => {
  it('keeps same-category spares, dropping retired, other categories, and the current component', () => {
    const list = [
      component(1), component(2, { retired_on: '2026-02-01' }), component(3, { category: 'chain' }), component(100),
    ]
    expect(ids(swapOptions(list, slot('both'), true))).toEqual([1])
  })

  it('drops a component installed elsewhere outside the shared-cassette case', () => {
    const onBoth = component(1, { current_bikes: [{ id: 1, name: 'One', ride_context: 'both' }] })
    expect(swapOptions([onBoth], slot('indoor_only'), true)).toEqual([])
  })

  it("lists a shared indoor cassette for another bike's indoor_only slot", () => {
    const trainer = component(1, { current_bikes: [indoorOn(1), indoorOn(2)] })
    const options = swapOptions([trainer], slot('indoor_only'), true)
    expect(options.map((o) => o.kind)).toEqual(['shared'])
  })

  it('never lists it for a both or outdoor_only slot', () => {
    const trainer = component(1, { current_bikes: [indoorOn(1)] })
    expect(swapOptions([trainer], slot('both'), true)).toEqual([])
    expect(swapOptions([trainer], slot('outdoor_only'), true)).toEqual([])
  })

  it("never lists it for a bike it's already on, or when the category doesn't allow multiple", () => {
    const trainer = component(1, { current_bikes: [indoorOn(1), indoorOn(3)] })
    expect(swapOptions([trainer], slot('indoor_only', 3), true)).toEqual([])
    expect(swapOptions([component(2, { current_bikes: [indoorOn(1)] })], slot('indoor_only'), false)).toEqual([])
  })
})

describe('orderSwapOptions', () => {
  it('puts recently removed spares first, then never-installed by name, then shared by name', () => {
    const older = component(1, { label: 'B', last_bike: { id: 1, name: 'One', removed_at: '2026-01-01T00:00:00Z' } })
    const newer = component(2, { label: 'Z', last_bike: { id: 1, name: 'One', removed_at: '2026-03-01T00:00:00Z' } })
    const never = component(3, { label: 'A' })
    const shared = component(4, { label: 'AA', current_bikes: [indoorOn(1)] })
    const ordered = orderSwapOptions([
      { component: shared, kind: 'shared' }, { component: never, kind: 'spare' },
      { component: older, kind: 'spare' }, { component: newer, kind: 'spare' },
    ])
    expect(ordered.map((o) => o.component.id)).toEqual([2, 1, 3, 4])
  })
})

describe('swapOptionStatus and emptyOptionLabel', () => {
  it('describes each option', () => {
    expect(swapOptionStatus({ component: component(1, { last_bike: { id: 1, name: 'Juan Solo', removed_at: '' } }), kind: 'spare' })).toBe('Last on Juan Solo')
    expect(swapOptionStatus({ component: component(1), kind: 'spare' })).toBe('Never installed')
    expect(swapOptionStatus({ component: component(1, { current_bikes: [indoorOn(1, 'One'), indoorOn(2, 'Two')] }), kind: 'shared' })).toBe('Also on One, Two (indoor)')
  })

  it('names the category in the empty row', () => {
    expect(emptyOptionLabel('cassette')).toBe('No spare cassettes')
  })
})

describe('canTakeComponent', () => {
  it('rejects a component left on a retired bike, like a retired one', () => {
    const target = { bikeId: 3, category: 'cassette', rideContext: 'indoor_only' as const }
    expect(canTakeComponent({ category: 'cassette', retired_on: null }, [], target, true)).toBe('spare')
    expect(canTakeComponent({ category: 'cassette', retired_on: null, effectively_retired: true }, [], target, true)).toBeNull()
    expect(canTakeComponent({ category: 'cassette', retired_on: '2026-01-01' }, [], target, true)).toBeNull()
  })
})
