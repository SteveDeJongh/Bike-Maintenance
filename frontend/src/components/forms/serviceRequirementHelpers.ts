import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypeSelect'
import type { SatisfierInput } from '../../api/mutations'
import type { CalendarUnit, RideFilter } from '../../types/models'

// Shared by CategoryServiceRequirementsModal (the Settings page's template
// editor) and ServiceIntervalsSection (a component's own custom requirement
// editor) -- "Custom requirements edit satisfiers inline with same editor
// as Settings" per the plan, so this is the one place that editor's
// constants/conversions/pure helpers live. The JSX components themselves
// (SatisfiersEditor, DraftSatisfierRow) live in the sibling
// serviceRequirementShared.tsx -- split so this file can be freely
// imported by both without tripping react-refresh's "a file must only
// export components" rule.

export const RIDE_FILTER_OPTIONS = [
  { value: 'all', label: 'All rides' },
  { value: 'outdoor', label: 'Outdoor only' },
  { value: 'indoor', label: 'Indoor only' },
]

export const RIDE_FILTER_LABELS: Record<RideFilter, string> = {
  all: 'All rides',
  outdoor: 'Outdoor only',
  indoor: 'Indoor only',
}

export const CALENDAR_UNIT_OPTIONS = [
  { value: 'day', label: 'days' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
]

export function metersToKm(meters: number | null): number | '' {
  return meters == null ? '' : meters / 1000
}
export function kmToMeters(km: number | ''): number | null {
  return km === '' ? null : Math.round(km * 1000)
}
export function secondsToHours(seconds: number | null): number | '' {
  return seconds == null ? '' : seconds / 3600
}
export function hoursToSeconds(hours: number | ''): number | null {
  return hours === '' ? null : Math.round(hours * 3600)
}

interface ThresholdOwner {
  distance_meters: number | null
  moving_time_seconds: number | null
  calendar_amount: number | null
  calendar_unit: CalendarUnit | null
}

// Whichever threshold is reached first drives the requirement due, so this
// joins every set dimension with " / ". Takes any requirement-shaped object
// (a template, a raw ComponentServiceRequirement, or a WithStatus row's
// effective values).
export function formatThresholdSummary(requirement: ThresholdOwner): string {
  const parts: string[] = []
  if (requirement.distance_meters != null) parts.push(formatDistance(requirement.distance_meters))
  if (requirement.moving_time_seconds != null) parts.push(formatDuration(requirement.moving_time_seconds))
  if (requirement.calendar_amount != null && requirement.calendar_unit != null) {
    parts.push(`${requirement.calendar_amount} ${requirement.calendar_unit}${requirement.calendar_amount === 1 ? '' : 's'}`)
  }
  return parts.join(' / ') || 'No threshold set'
}

export interface ActiveDimensions {
  distance: boolean
  movingTime: boolean
  calendar: boolean
}

export function activeDimensionsOf(requirement: ThresholdOwner): ActiveDimensions {
  return {
    distance: requirement.distance_meters != null,
    movingTime: requirement.moving_time_seconds != null,
    calendar: requirement.calendar_amount != null,
  }
}

// --- Draft satisfiers (collected locally before the owning requirement
// even exists yet, then submitted together in one create call so "at
// least one satisfier" is never left with a gap) ---

export interface DraftSatisfier {
  key: string
  typeId: string
  typeName: string
  km: number | ''
  hours: number | ''
  calendarAmount: number | ''
  calendarUnit: CalendarUnit
}

export function emptyDraftSatisfier(key: string): DraftSatisfier {
  return { key, typeId: '', typeName: '', km: '', hours: '', calendarAmount: '', calendarUnit: 'month' }
}

export function draftSatisfiersReady(drafts: DraftSatisfier[]): boolean {
  return drafts.every((d) => d.typeId !== '' && (d.typeId !== CREATE_NEW_SERVICE_TYPE || d.typeName.trim() !== ''))
}

// Resolves every draft's service type (creating a brand-new ServiceType
// where picked) and builds the SatisfierInput[] payload for the owning
// requirement's create call. Returns null if any resolution failed (the
// caller's resolveServiceTypeId already surfaces the error via its own
// createServiceTypeError state).
export async function resolveDraftSatisfiers(
  drafts: DraftSatisfier[],
  resolveServiceTypeId: (id: string, name: string) => Promise<number>,
): Promise<SatisfierInput[] | null> {
  const resolved: SatisfierInput[] = []
  for (const draft of drafts) {
    const serviceTypeId = await resolveServiceTypeId(draft.typeId, draft.typeName).catch(() => null)
    if (serviceTypeId === null) return null
    resolved.push({
      service_type_id: serviceTypeId,
      allowance_distance_meters: kmToMeters(draft.km),
      allowance_moving_time_seconds: hoursToSeconds(draft.hours),
      allowance_calendar_amount: draft.calendarAmount === '' ? null : draft.calendarAmount,
      allowance_calendar_unit: draft.calendarAmount === '' ? null : draft.calendarUnit,
    })
  }
  return resolved
}
