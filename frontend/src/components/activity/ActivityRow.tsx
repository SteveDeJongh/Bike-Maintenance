import type { ReactNode } from 'react'
import { Box, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconArrowsExchange, IconBike, IconTool } from '@tabler/icons-react'
import { formatActivityField, type ActivityField } from './activityFields'
import { dayLabel, phoneMetricLine, serviceChipLabels, timeLabel } from './activityListModel'
import ServiceChips from './ServiceChips'
import DataListRow from '../datalist/DataListRow'
import { rideSportLabel } from '../../utils/recentActivity'
import type { ActivityItem } from '../../types/models'

const RIDE_CONTEXT_TEXT = { outdoor_only: 'Outdoor only', indoor_only: 'Indoor only' } as const

function itemTitle(item: ActivityItem): string {
  switch (item.kind) {
    case 'ride':
      return item.name
    case 'service_session':
      return 'Service'
    case 'maintenance_event':
      return item.service_type_name
    case 'setup_change':
      return item.summary
  }
}

// "Morning loop, Nov 22, open details"
function accessibleName(item: ActivityItem): string {
  const day = new Date(item.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${itemTitle(item)}, ${day}, open details`
}

function KindIcon({ item }: { item: ActivityItem }) {
  if (item.kind === 'ride') {
    return (
      <ThemeIcon radius="xl" size={32} variant="light">
        <IconBike size={18} />
      </ThemeIcon>
    )
  }
  const service = item.kind !== 'setup_change'
  return (
    <ThemeIcon radius="xl" size={32} variant="light" color={service ? 'teal' : 'blue'}>
      {service ? <IconTool size={18} /> : <IconArrowsExchange size={18} />}
    </ThemeIcon>
  )
}

// The title (with the time dimmed beside it) and the kind's sub-line.
// "stacked" (phone) puts any service chips on their own line below;
// "inline" (desktop) puts them to the right, so service rows stay the
// same height as ride rows.
function ActivityCell({ item, layout = 'stacked' }: { item: ActivityItem; layout?: 'stacked' | 'inline' }) {
  let subLine: ReactNode
  let chips: string[] = []

  switch (item.kind) {
    case 'ride':
      subLine = item.bike ? (
        `${rideSportLabel(item.activity_type)} · ${item.bike.name}`
      ) : (
        <Text span size="xs" c="orange">
          {rideSportLabel(item.activity_type)} · No bike on Strava
        </Text>
      )
      break
    case 'service_session':
      subLine = `${item.bike?.name ?? 'Off bike'} · ${item.item_count} ${item.item_count === 1 ? 'item' : 'items'}`
      chips = serviceChipLabels(item)
      break
    case 'maintenance_event':
      subLine = item.bike?.name ?? 'Off bike'
      chips = serviceChipLabels(item)
      break
    case 'setup_change':
      subLine = [item.bike?.name, item.ride_context && RIDE_CONTEXT_TEXT[item.ride_context]].filter(Boolean).join(' · ')
      break
  }

  const text = (
    <Stack gap={0} style={{ minWidth: 0, flex: layout === 'inline' ? '0 1 auto' : undefined }}>
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
        <Text size="sm" fw={500} truncate>
          {itemTitle(item)}
        </Text>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {timeLabel(item.occurred_at)}
        </Text>
      </Group>
      {subLine && (
        <Text size="xs" c="dimmed" truncate>
          {subLine}
        </Text>
      )}
    </Stack>
  )

  if (chips.length === 0) return text
  if (layout === 'inline') {
    return (
      <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        {text}
        <ServiceChips chips={chips} inline />
      </Group>
    )
  }
  return (
    <Stack gap={2} style={{ minWidth: 0 }}>
      {text}
      <ServiceChips chips={chips} inline={false} />
    </Stack>
  )
}

function DateCell({ value }: { value: string | null }) {
  if (!value) return <span />
  const { primary, secondary } = dayLabel(value)
  return (
    <Stack gap={0}>
      <Text size="sm" fw={500}>
        {primary}
      </Text>
      <Text size="xs" c="dimmed">
        {secondary}
      </Text>
    </Stack>
  )
}

// One list row, any kind, on the shared DataListRow (the whole row is the
// click target and a keyboard button: Enter/Space). Desktop puts one cell
// per DataList column -- Date, icon, Activity, each field -- so they line
// up with the header; the phone variant stacks the chosen fields into one
// dimmed line under the title.
export default function ActivityRow({
  item,
  fields,
  showDate,
  phone = false,
  onOpen,
}: {
  item: ActivityItem
  fields: ActivityField[]
  // The day label shows on a day's first row only (desktop, week grouping).
  showDate: boolean
  // Stacked phone layout: no grid columns; the day is a header above.
  phone?: boolean
  onOpen: () => void
}) {
  const noBike = item.kind === 'ride' && !item.bike
  // Service sessions and events have no metric values, so on desktop their
  // Activity cell spans the metric columns to give the chips room.
  const spansMetrics = item.kind === 'service_session' || item.kind === 'maintenance_event'
  const rowProps = { ariaLabel: accessibleName(item), onOpen, tone: noBike ? ('warning' as const) : undefined }

  if (phone) {
    const metrics = phoneMetricLine(item, fields)
    return (
      <DataListRow {...rowProps} stacked>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <KindIcon item={item} />
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <ActivityCell item={item} />
            {metrics && (
              <Text size="xs" c="dimmed">
                {metrics}
              </Text>
            )}
          </Stack>
        </Group>
      </DataListRow>
    )
  }

  return (
    <DataListRow {...rowProps}>
      <DateCell value={showDate ? item.occurred_at : null} />
      <KindIcon item={item} />
      {spansMetrics ? (
        <Box style={{ gridColumn: '3 / -1', minWidth: 0 }}>
          <ActivityCell item={item} layout="inline" />
        </Box>
      ) : (
        <>
          <ActivityCell item={item} layout="inline" />
          {fields.map((field) => {
            const value = item.kind === 'ride' ? formatActivityField(item, field) : null
            return (
              <Text
                key={field}
                size="sm"
                ta="right"
                c={field === 'distance_meters' ? undefined : 'dimmed'}
                fw={field === 'distance_meters' ? 600 : undefined}
                style={{ whiteSpace: 'nowrap' }}
              >
                {value ?? ''}
              </Text>
            )
          })}
        </>
      )}
    </DataListRow>
  )
}

