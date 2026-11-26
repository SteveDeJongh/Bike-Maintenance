import { Fragment, useMemo, type ReactNode } from 'react'
import { Anchor, Box, Button, Group, Stack, Text } from '@mantine/core'
import { Link, useNavigate } from 'react-router-dom'
import DataList, { DataListBand } from '../datalist/DataList'
import DataListHeader, { type DataListColumn } from '../datalist/DataListHeader'
import DataListRow from '../datalist/DataListRow'
import { dataListMinWidth, dataListTemplate, fieldMinWidth } from '../datalist/dataListModel'
import WearBar from '../dashboard/WearBar'
import {
  categoryLabel,
  COMPONENT_LIST_FIELD_LABELS,
  RIDE_CONTEXT_LABELS,
  type ComponentListField,
  type ComponentListSort,
} from '../../constants'
import { componentState, spareReadyLabel } from '../../utils/componentState'
import { formatShortDate } from '../../utils/datetime'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import { formatDistance } from '../../utils/distance'
import { componentWearValue } from '../../utils/wear'
import {
  bandSummary,
  firstSortDirection,
  groupComponents,
  installedBikeParts,
  retiredBikeCell,
  sortComponents,
  type ComponentGroupBy,
  type ComponentRow,
} from './componentListModel'
import type { ComponentsView } from './useComponentsView'
import type { ComponentListItem } from '../../types/models'

const MAIN_MIN = 200
const BIKE_MIN = 160
const SERVICE_MIN = 190
const RETIRE_MIN = 72
// Fields holding text rather than a metric: left-aligned.
const TEXT_FIELDS: readonly ComponentListField[] = ['brand', 'model', 'category']
const FIELD_VALUE_MIN: Record<ComponentListField, number> = {
  lifetime_distance: 90,
  acquired_on: 96,
  brand: 100,
  model: 110,
  category: 110,
  retired_on: 96,
}

function fieldMin(field: ComponentListField): number {
  return fieldMinWidth(COMPONENT_LIST_FIELD_LABELS[field], FIELD_VALUE_MIN[field])
}

// Keeps a click or key on an in-row control (a bike link, Retire) from
// also opening the row.
function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

function fieldCell(field: ComponentListField, component: ComponentListItem): string {
  switch (field) {
    case 'lifetime_distance':
      return formatDistance(component.lifetime_distance_meters)
    case 'acquired_on':
      return formatShortDate(component.acquired_on)
    case 'brand':
      return component.brand || '—'
    case 'model':
      return component.model || '—'
    case 'category':
      return categoryLabel(component.category)
    case 'retired_on': {
      const date = component.effective_retired_on ?? component.retired_on
      return date ? formatShortDate(date) : '—'
    }
  }
}

function BikeLink({ id, children }: { id: number; children: ReactNode }) {
  return (
    <Anchor component={Link} to={`/bikes/${id}`} size="sm" onClick={stop} onKeyDown={stop}>
      {children}
    </Anchor>
  )
}

// Installed: the bike (linked), "since <date>" -- or, for a shared indoor
// cassette, "Juan Solo +1" and "Trainer only, shared". Spare: "Spare" in
// blue, then where it was last. Retired: when, then where it was last.
// `inline` (the phone row) puts both parts on one line.
export function ComponentBikeCell({
  component,
  bikeId,
  inline = false,
}: {
  component: ComponentListItem
  bikeId: number | null
  inline?: boolean
}) {
  const state = componentState(component)
  let main: ReactNode
  let sub: string

  if (state === 'installed') {
    const { bike, others } = installedBikeParts(component, bikeId)
    main = (
      <Text size="sm" truncate>
        <BikeLink id={bike.id}>{bike.name}</BikeLink>
        {others > 0 && (
          <Text span size="sm" c="dimmed">
            {` +${others}`}
          </Text>
        )}
      </Text>
    )
    sub =
      component.current_bikes.length > 1
        ? `${RIDE_CONTEXT_LABELS[component.current_bikes[0].ride_context]}, shared`
        : component.assigned_since
          ? `since ${formatShortDate(component.assigned_since)}`
          : ''
  } else if (state === 'spare') {
    main = (
      <Text size="sm" c="blue" fw={500}>
        Spare
      </Text>
    )
    sub = component.last_bike ? `Last on ${component.last_bike.name}` : 'Never installed'
  } else {
    const cell = retiredBikeCell(component)
    main = <Text size="sm">Retired {cell.date ? formatShortDate(cell.date) : ''}</Text>
    sub = cell.where
  }

  if (inline) {
    return (
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
        <Box style={{ flexShrink: 0 }}>{main}</Box>
        {sub && (
          <Text size="xs" c="dimmed" truncate>
            · {sub}
          </Text>
        )}
      </Group>
    )
  }

  return (
    <Stack gap={0} style={{ minWidth: 0 }}>
      {main}
      {sub && (
        <Text size="xs" c="dimmed" truncate>
          {sub}
        </Text>
      )}
    </Stack>
  )
}

// The worst enabled requirement's bar and "4 km left" / "120 km over";
// a faint empty bar and "No interval" without one; a rotating spare
// serviced since it came off reads "Wax · ready" in teal.
export function ComponentServiceCell({ component }: { component: ComponentListItem }) {
  const ready = spareReadyLabel(component)
  const hasRequirement = component.has_enabled_requirement && component.driving_dimension != null
  const text = ready ?? (hasRequirement ? componentWearValue({ ...component, total_distance_meters: null }) : 'No interval')

  return (
    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
      <WearBar
        fraction={component.fraction_used}
        status={component.service_status}
        style={{ width: 64, flexShrink: 0, opacity: hasRequirement ? undefined : 0.5 }}
      />
      <Text
        size="sm"
        c={ready ? 'teal' : component.service_status === 'due' ? 'red' : 'dimmed'}
        fw={ready ? 500 : undefined}
        truncate
      >
        {text}
      </Text>
    </Group>
  )
}

// On a phone the wrapper grows to a 44px tap target; the pill keeps its size.
function RetireButton({ onRetire, phone = false }: { onRetire: () => void; phone?: boolean }) {
  return (
    <Box onClick={stop} onKeyDown={stop} style={phone ? MOBILE_TAP_TARGET_STYLE : undefined}>
      <Button size="compact-xs" radius="xl" variant="default" onClick={onRetire}>
        Retire
      </Button>
    </Box>
  )
}

function ComponentTitle({ component }: { component: ComponentListItem }) {
  const brandModel = [component.brand, component.model].filter(Boolean).join(' · ')
  return (
    <Stack gap={0} style={{ minWidth: 0 }}>
      <Text size="sm" fw={600} truncate>
        {component.label}
      </Text>
      {brandModel && (
        <Text size="xs" c="dimmed" truncate>
          {brandModel}
        </Text>
      )}
    </Stack>
  )
}

// The Components list (docs/frontend-ui.md, "Components page"): a DataList
// of Component, Bike, Service, the chosen Fields and a Retire pill, in
// bands by category or bike (or flat). The whole row opens the component;
// Edit and Delete live on its page. Rows arrive already filtered.
export default function ComponentsList({
  components,
  view,
  groupBy,
  categoryOrder,
  stacked = false,
  onRetire,
}: {
  components: ComponentListItem[]
  view: ComponentsView
  groupBy: ComponentGroupBy
  categoryOrder: readonly string[]
  // The phone layout: no header, each row stacks the name (and Retire),
  // the bike line and the wear; bands stay.
  stacked?: boolean
  onRetire: (component: ComponentListItem) => void
}) {
  const navigate = useNavigate()
  const { orderedColumns: fields, sortColumn, sortDirection, setSort } = view.table

  const groups = useMemo(
    () => groupComponents(sortComponents(components, sortColumn, sortDirection), groupBy, categoryOrder),
    [components, sortColumn, sortDirection, groupBy, categoryOrder],
  )

  const template = dataListTemplate({
    leading: [],
    main: `minmax(${MAIN_MIN}px, 1.3fr)`,
    fields: [
      `minmax(${BIKE_MIN}px, 1fr)`,
      `minmax(${SERVICE_MIN}px, 1fr)`,
      ...fields.map((field) => `minmax(${fieldMin(field)}px, auto)`),
      `${RETIRE_MIN}px`,
    ],
  })
  const minWidth = dataListMinWidth({
    leading: [],
    main: MAIN_MIN,
    fields: [BIKE_MIN, SERVICE_MIN, ...fields.map(fieldMin), RETIRE_MIN],
  })

  const columns: DataListColumn<ComponentListSort>[] = [
    { key: 'component', label: 'Component' },
    { key: 'bike', label: 'Bike' },
    { key: 'service', label: 'Service' },
    ...fields.map((field) => ({
      key: field,
      label: COMPONENT_LIST_FIELD_LABELS[field],
      align: TEXT_FIELDS.includes(field) ? ('left' as const) : ('right' as const),
    })),
    { key: 'retire', sortable: false },
  ]

  function onSort(column: ComponentListSort) {
    if (column === sortColumn) setSort(column, sortDirection === 'asc' ? 'desc' : 'asc')
    else setSort(column, firstSortDirection(column))
  }

  function renderRow({ key, component, bikeId }: ComponentRow) {
    const retired = componentState(component) === 'retired'
    const rowProps = {
      ariaLabel: `${component.label}${retired ? ', retired' : ''}, open component`,
      onOpen: () => navigate(`/components/${component.id}`),
      tone: retired ? ('muted' as const) : undefined,
    }

    if (stacked) {
      return (
        <DataListRow key={key} {...rowProps} stacked>
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <ComponentTitle component={component} />
              {!retired && <RetireButton onRetire={() => onRetire(component)} phone />}
            </Group>
            <ComponentBikeCell component={component} bikeId={bikeId} inline />
            <ComponentServiceCell component={component} />
          </Stack>
        </DataListRow>
      )
    }

    return (
      <DataListRow key={key} {...rowProps}>
        <ComponentTitle component={component} />
        <ComponentBikeCell component={component} bikeId={bikeId} />
        <ComponentServiceCell component={component} />
        {fields.map((field) => {
          const bold = field === 'lifetime_distance' && !retired
          return (
            <Text
              key={field}
              component="div"
              size="sm"
              ta={TEXT_FIELDS.includes(field) ? 'left' : 'right'}
              c={bold ? undefined : 'dimmed'}
              fw={bold ? 600 : undefined}
              truncate
            >
              {fieldCell(field, component)}
            </Text>
          )
        })}
        <Group justify="flex-end">{!retired && <RetireButton onRetire={() => onRetire(component)} />}</Group>
      </DataListRow>
    )
  }

  return (
    <DataList template={template} minWidth={minWidth} stacked={stacked}>
      {!stacked && <DataListHeader columns={columns} sortColumn={sortColumn} order={sortDirection} onSort={onSort} />}
      {groups.map((group) => (
        <Fragment key={group.key}>
          {group.title != null && (
            <DataListBand
              title={
                <Text size="sm">
                  <Text span fw={600}>
                    {group.title}
                  </Text>
                  <Text span c="dimmed">{` · ${bandSummary(group.rows)}`}</Text>
                </Text>
              }
            />
          )}
          {group.rows.map(renderRow)}
        </Fragment>
      ))}
    </DataList>
  )
}
