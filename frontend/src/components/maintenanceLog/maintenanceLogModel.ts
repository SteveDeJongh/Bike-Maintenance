import { isDatePreset, type DatePreset } from '../activity/dateRanges'
import { formatShortDate } from '../../utils/datetime'
import {
  DEFAULT_MAINTENANCE_FIELDS,
  isMaintenanceField,
  MAX_MAINTENANCE_FIELDS,
  type MaintenanceField,
  type MaintenanceSort,
} from './maintenanceLogFields'
import type { ComponentTileCounts } from '../componentList/componentListModel'
import type {
  Bike,
  MaintenanceLogBandTotals,
  MaintenanceLogEvent,
  MaintenanceLogMeta,
  MaintenanceLogSession,
  TableViewPreferenceData,
} from '../../types/models'

export type MaintenanceKind = 'session' | 'single'
export type MaintenanceGroupBy = 'month' | 'component' | 'none'

export const MAINTENANCE_KINDS: readonly MaintenanceKind[] = ['session', 'single']
export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = { session: 'Sessions', single: 'Single events' }
export const GROUP_BY_OPTIONS: { value: MaintenanceGroupBy; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'component', label: 'Component' },
  { value: 'none', label: 'None' },
]

export const DEFAULT_DATE_PRESET: DatePreset = 'this_year'

export interface MaintenanceView {
  fields: MaintenanceField[]
  kinds: MaintenanceKind[]
  groupBy: MaintenanceGroupBy
  bikeId: number | undefined
  category: string | undefined
  serviceTypeId: number | undefined
  // null is All time.
  datePreset: DatePreset | null
  customRange: [string | null, string | null]
}

const isKind = (value: string): value is MaintenanceKind => (MAINTENANCE_KINDS as readonly string[]).includes(value)
const isGroupBy = (value: unknown): value is MaintenanceGroupBy => GROUP_BY_OPTIONS.some((option) => option.value === value)
const positiveId = (value: unknown) => (typeof value === 'number' && value > 0 ? value : undefined)
const isoDay = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) ? value : null)

// The saved maintenance_events preference, validated: unknown or old
// values (the old table's columns) drop back to the defaults -- Fields
// fall back to the defaults when none of the saved ones survive.
export function readMaintenanceView(data: TableViewPreferenceData): MaintenanceView {
  const fields = (data.columns ?? []).filter(isMaintenanceField).slice(0, MAX_MAINTENANCE_FIELDS)
  const kinds = (data.kinds ?? []).filter(isKind)
  const range = Array.isArray(data.date_range) ? data.date_range : []
  return {
    fields: fields.length > 0 ? fields : DEFAULT_MAINTENANCE_FIELDS,
    kinds: kinds.length > 0 ? MAINTENANCE_KINDS.filter((kind) => kinds.includes(kind)) : [...MAINTENANCE_KINDS],
    groupBy: isGroupBy(data.group_by) ? data.group_by : 'month',
    bikeId: positiveId(data.bike_id),
    category: typeof data.category === 'string' && data.category ? data.category : undefined,
    serviceTypeId: positiveId(data.service_type_id),
    datePreset: data.date_preset === 'all' ? null : isDatePreset(data.date_preset) ? data.date_preset : DEFAULT_DATE_PRESET,
    customRange: [isoDay(range[0]), isoDay(range[1])],
  }
}

// Sorting by a field lists services by that number, so bands and session
// headers no longer mean anything -- the list is flat while a field sort
// is active, and the saved grouping comes back with Date.
export function effectiveGroupBy(sort: MaintenanceSort, saved: MaintenanceGroupBy): MaintenanceGroupBy | 'flat' {
  return sort === 'performed_at' ? saved : 'flat'
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, i) => value === b[i])

// The phone View button's badge: how many of its choices (kinds, Group by,
// Fields, Sort) differ from the defaults.
export function viewBadgeCount(view: {
  kinds: MaintenanceKind[]
  groupBy: MaintenanceGroupBy
  fields: MaintenanceField[]
  sort: MaintenanceSort
  order: 'asc' | 'desc'
}): number {
  return [
    view.kinds.length !== MAINTENANCE_KINDS.length,
    view.groupBy !== 'month',
    !sameList(view.fields, DEFAULT_MAINTENANCE_FIELDS),
    view.sort !== 'performed_at' || view.order !== 'desc',
  ].filter(Boolean).length
}

// Log service session's bike: the active bike ridden most recently, else
// the first active one by name; undefined with no active bike.
export function defaultSessionBike<B extends Pick<Bike, 'id' | 'name' | 'retired_on'> & { last_ride_on: string | null }>(
  bikes: readonly B[] | undefined,
): B | undefined {
  const active = (bikes ?? []).filter((bike) => !bike.retired_on)
  const ridden = (bike: B) => (bike.last_ride_on ? Date.parse(bike.last_ride_on) : -Infinity)
  return [...active].sort((a, b) => ridden(b) - ridden(a) || a.name.localeCompare(b.name))[0]
}

export interface MaintenanceTile {
  label: string
  value: string
  color?: string
}

// The five tiles. The meta ones ignore the filters; Due · soon is the
// Components page tile's own count (componentTileCounts), so the two pages
// always agree.
export function maintenanceTiles(
  tiles: MaintenanceLogMeta['tiles'] | undefined,
  componentCounts: Pick<ComponentTileCounts, 'due' | 'soon'> | undefined,
  now: Date = new Date(),
): MaintenanceTile[] {
  const dash = '—'
  const attention = componentCounts ? componentCounts.due + componentCounts.soon > 0 : false
  return [
    { label: 'Services this year', value: tiles ? tiles.services_this_year.toLocaleString() : dash },
    { label: 'Sessions', value: tiles ? tiles.sessions_this_year.toLocaleString() : dash },
    { label: 'Last service', value: tiles?.last_service_at ? formatShortDate(tiles.last_service_at, now) : dash },
    {
      label: 'Due · soon',
      value: componentCounts ? `${componentCounts.due} · ${componentCounts.soon}` : dash,
      color: attention ? 'orange' : undefined,
    },
    {
      label: 'Most serviced',
      value: tiles?.most_serviced ? `${tiles.most_serviced.label} · ${tiles.most_serviced.count}` : dash,
    },
  ]
}

// The phone header's dimmed line: "86 services this year".
export function servicesThisYearLine(count: number | undefined): string {
  if (count == null) return ''
  return `${count.toLocaleString()} ${count === 1 ? 'service' : 'services'} this year`
}

// --- the list ---

export interface MaintenanceLogPage {
  events: MaintenanceLogEvent[]
  sessions: Record<string, MaintenanceLogSession>
  meta: Pick<MaintenanceLogMeta, 'month_totals' | 'component_totals'> | null
}

export type MaintenanceRenderEntry =
  | { type: 'month'; key: string; monthKey: string; title: string; totals: string }
  | { type: 'component'; key: string; title: string }
  | { type: 'session'; key: string; session: MaintenanceLogSession; countLabel: string; showDate: boolean }
  // inSession: under a session header (no date, the line-and-dot gutter).
  // sessionLink: a session's event shown without its header (Component
  // grouping, a field sort) -- the Service cell gets a "Session" marker.
  | { type: 'event'; key: string; event: MaintenanceLogEvent; showDate: boolean; inSession: boolean; sessionLink: boolean }

const pad = (n: number) => String(n).padStart(2, '0')

// The local month an instant falls in, "2026-11" -- the key the log's
// meta.month_totals uses (the page sends the browser's own zone as tz).
export function monthKey(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function localDayKey(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// "November 2026"
export function monthTitle(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`

// "18 services · 5 sessions · 9 components" -- sessions only when there
// are any.
export function monthTotalsLine(totals: MaintenanceLogBandTotals | undefined): string {
  if (!totals) return ''
  const parts = [plural(totals.services, 'service')]
  if (totals.sessions) parts.push(plural(totals.sessions, 'session'))
  parts.push(plural(totals.components, 'component'))
  return parts.join(' · ')
}

// "3 services", or "2 of 3 services" when the filters hide some.
export function sessionCountLabel(session: Pick<MaintenanceLogSession, 'event_count' | 'matching_count'>): string {
  if (session.matching_count < session.event_count) return `${session.matching_count} of ${plural(session.event_count, 'service')}`
  return plural(session.event_count, 'service')
}

// The flat list MaintenanceLogList renders, from the loaded pages in order.
// - month: a band at each new local month (one band even across a Load
//   more boundary), its totals from the first page that has them; a
//   session is a header row followed by its events, merging across pages;
//   the date shows on each day's first top-level row.
// - none: the same with no bands, and every top-level row shows its date.
// - component: a band per component ("Chain S1 · 14 services"), no session
//   headers -- a session's events carry a "Session" marker instead.
// - flat (a field sort): no bands, no session headers, every date shown.
export function buildMaintenanceRenderList(
  pages: MaintenanceLogPage[],
  groupBy: MaintenanceGroupBy | 'flat',
): MaintenanceRenderEntry[] {
  const monthTotals = new Map<string, MaintenanceLogBandTotals>()
  const componentTotals = new Map<string, number>()
  const sessions = new Map<number, MaintenanceLogSession>()
  for (const page of pages) {
    for (const [key, totals] of Object.entries(page.meta?.month_totals ?? {})) if (!monthTotals.has(key)) monthTotals.set(key, totals)
    for (const [key, count] of Object.entries(page.meta?.component_totals ?? {})) if (!componentTotals.has(key)) componentTotals.set(key, count)
    for (const session of Object.values(page.sessions)) if (!sessions.has(session.id)) sessions.set(session.id, session)
  }

  const headers = groupBy === 'month' || groupBy === 'none'
  const entries: MaintenanceRenderEntry[] = []
  let lastBand: string | null = null
  let lastDay: string | null = null
  let lastSession: number | null = null

  pages.flatMap((page) => page.events).forEach((event, index) => {
    if (groupBy === 'month') {
      const month = monthKey(event.performed_at)
      if (month !== lastBand) {
        entries.push({ type: 'month', key: `month-${month}`, monthKey: month, title: monthTitle(month), totals: monthTotalsLine(monthTotals.get(month)) })
        lastBand = month
        lastDay = null
        lastSession = null
      }
    } else if (groupBy === 'component') {
      const component = String(event.component.id)
      if (component !== lastBand) {
        const count = componentTotals.get(component)
        entries.push({
          type: 'component',
          key: `component-${component}`,
          title: count == null ? event.component.label : `${event.component.label} · ${plural(count, 'service')}`,
        })
        lastBand = component
      }
    }

    const session = event.service_session_id != null ? sessions.get(event.service_session_id) : undefined
    const day = localDayKey(event.performed_at)

    if (headers && session) {
      if (session.id !== lastSession) {
        entries.push({
          type: 'session',
          key: `session-${session.id}-${index}`,
          session,
          countLabel: sessionCountLabel(session),
          showDate: groupBy === 'none' || day !== lastDay,
        })
        lastSession = session.id
        lastDay = day
      }
      entries.push({ type: 'event', key: `event-${event.id}`, event, showDate: false, inSession: true, sessionLink: false })
      return
    }

    lastSession = null
    entries.push({
      type: 'event',
      key: `event-${event.id}`,
      event,
      showDate: !headers || groupBy === 'none' || day !== lastDay,
      inSession: false,
      sessionLink: event.service_session_id != null,
    })
    lastDay = day
  })

  return entries
}

const shortDay = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// "Drip wax, Chain S1, Nov 14, open"
export function eventAccessibleName(event: MaintenanceLogEvent): string {
  return `${event.service_type.name}, ${event.component.label}, ${shortDay(event.performed_at)}, open`
}

// "Service session, Libre, 3 services, Nov 14, open"
export function sessionAccessibleName(session: MaintenanceLogSession, countLabel: string): string {
  return ['Service session', session.bike?.name, countLabel, shortDay(session.performed_at), 'open'].filter(Boolean).join(', ')
}
