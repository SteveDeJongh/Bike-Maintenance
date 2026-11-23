import type { KeyboardEvent, ReactNode } from 'react'
import { Badge, Box, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconArrowsExchange, IconBike, IconTool } from '@tabler/icons-react'
import { formatActivityField, type ActivityField } from './activityFields'
import { activityGridTemplate, dayLabel, timeLabel } from './activityListModel'
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

function ServiceChips({ chips }: { chips: string[] }) {
  return (
    <Group gap={4} wrap="wrap" mt={2}>
      {chips.map((chip, index) => (
        <Badge key={`${chip}-${index}`} size="sm" variant="light" color="teal" tt="none" fw={500}>
          {chip}
        </Badge>
      ))}
    </Group>
  )
}

// The title (with the time dimmed beside it) and the kind's sub-line.
function ActivityCell({ item }: { item: ActivityItem }) {
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
      chips = item.items.map((entry) => `${entry.label} · ${entry.service_type_name}`)
      break
    case 'maintenance_event':
      subLine = item.bike?.name ?? 'Off bike'
      chips = [`${item.label} · ${item.service_type_name}`]
      break
    case 'setup_change':
      subLine = [item.bike?.name, item.ride_context && RIDE_CONTEXT_TEXT[item.ride_context]].filter(Boolean).join(' · ')
      break
  }

  return (
    <Stack gap={0} style={{ minWidth: 0 }}>
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
      {chips.length > 0 && <ServiceChips chips={chips} />}
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

// One list row, any kind: the whole row is the click target (and a
// keyboard button: Enter/Space). Desktop lays it out on the list's shared
// grid template so the cells line up with the column header; the phone
// variant stacks the chosen fields into one dimmed line under the title.
export default function ActivityRow({
  item,
  fields,
  showDate,
  onOpen,
}: {
  item: ActivityItem
  fields: ActivityField[]
  // The day label shows on a day's first row only (desktop, week grouping).
  showDate: boolean
  onOpen: () => void
}) {
  const noBike = item.kind === 'ride' && !item.bike

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={accessibleName(item)}
      className="activity-row"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      style={{
        display: 'grid',
        gridTemplateColumns: activityGridTemplate(fields.length),
        columnGap: 'var(--mantine-spacing-sm)',
        alignItems: 'center',
        padding: '8px 12px',
        borderTop: '1px solid var(--mantine-color-default-border)',
        background: noBike ? 'var(--mantine-color-orange-light)' : undefined,
        cursor: 'pointer',
      }}
    >
      <DateCell value={showDate ? item.occurred_at : null} />
      <KindIcon item={item} />
      <ActivityCell item={item} />
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
    </Box>
  )
}

