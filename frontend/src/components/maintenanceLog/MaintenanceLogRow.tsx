import type { MouseEvent } from 'react'
import { Anchor, Badge, Box, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconTool } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import DataListRow from '../datalist/DataListRow'
import { dayLabel, timeLabel } from '../activity/activityListModel'
import { categoryLabel } from '../../constants'
import { fieldText, type MaintenanceField } from './maintenanceLogFields'
import { eventAccessibleName, sessionAccessibleName } from './maintenanceLogModel'
import type { MaintenanceLogEvent, MaintenanceLogSession } from '../../types/models'

const TEAL_LINE = 'var(--mantine-color-teal-6)'
const RIGHT_ALIGNED: readonly MaintenanceField[] = ['component_km', 'since_last', 'bike_km']

// Links and buttons inside a whole-row target open their own thing only.
const stop = (event: MouseEvent) => event.stopPropagation()

export function DateCell({ value }: { value: string | null }) {
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

export function WrenchIcon() {
  return (
    <ThemeIcon radius="xl" size={32} variant="light" color="teal">
      <IconTool size={18} />
    </ThemeIcon>
  )
}

// A session's event: a thin teal line through the row with a dot -- the
// line runs edge to edge (through the row's vertical padding), so a
// session's rows read as one thread.
function SessionThread() {
  return (
    <Box style={{ alignSelf: 'stretch', position: 'relative', margin: '-8px 0', minHeight: 40 }}>
      <Box style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 2, background: TEAL_LINE }} />
      <Box
        style={{ position: 'absolute', left: 11, top: '50%', marginTop: -5, width: 10, height: 10, borderRadius: '50%', background: TEAL_LINE }}
      />
    </Box>
  )
}

// "↺ Wax": each enabled requirement on the component this service resets.
export function ResetChips({ names }: { names: string[] }) {
  return names.map((name) => (
    <Badge key={name} size="xs" variant="outline" color="teal" tt="none" style={{ flexShrink: 0 }}>
      ↺ {name}
    </Badge>
  ))
}

function ServiceCell({
  event,
  showTime,
  sessionLink,
  onOpenSession,
}: {
  event: MaintenanceLogEvent
  showTime: boolean
  sessionLink: boolean
  onOpenSession: (sessionId: number) => void
}) {
  return (
    <Stack gap={0} style={{ minWidth: 0 }}>
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
        <Text size="sm" fw={500} truncate>
          {event.service_type.name}
        </Text>
        {showTime && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {timeLabel(event.performed_at)}
          </Text>
        )}
        <ResetChips names={event.resets} />
        {sessionLink && event.service_session_id != null && (
          <Anchor
            component="button"
            type="button"
            size="xs"
            c="dimmed"
            onClick={(e: MouseEvent) => {
              stop(e)
              onOpenSession(event.service_session_id!)
            }}
            style={{ whiteSpace: 'nowrap' }}
          >
            Session
          </Anchor>
        )}
      </Group>
      {event.notes && (
        <Text size="xs" c="dimmed" truncate>
          {event.notes}
        </Text>
      )}
    </Stack>
  )
}

function FieldCell({ event, field }: { event: MaintenanceLogEvent; field: MaintenanceField }) {
  if (field === 'component') {
    return (
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Anchor component={Link} to={`/components/${event.component.id}`} size="sm" onClick={stop} truncate>
          {event.component.label}
        </Anchor>
        <Text size="xs" c="dimmed" truncate>
          {categoryLabel(event.component.category)}
        </Text>
      </Stack>
    )
  }
  const right = RIGHT_ALIGNED.includes(field)
  const dimmed = (field === 'bike' && !event.bike) || field === 'logged_on' || field === 'category'
  return (
    <Text
      size="sm"
      ta={right ? 'right' : undefined}
      fw={field === 'component_km' ? 600 : undefined}
      c={dimmed ? 'dimmed' : undefined}
      truncate
    >
      {fieldText(event, field)}
    </Text>
  )
}

// One service on the Maintenance DataList: Date | gutter | Service | each
// field | the trailing column (empty here). Opens its edit modal.
export function EventRow({
  event,
  fields,
  showDate,
  inSession,
  sessionLink,
  onOpen,
  onOpenSession,
}: {
  event: MaintenanceLogEvent
  fields: MaintenanceField[]
  showDate: boolean
  inSession: boolean
  sessionLink: boolean
  onOpen: () => void
  onOpenSession: (sessionId: number) => void
}) {
  return (
    <DataListRow ariaLabel={eventAccessibleName(event)} onOpen={onOpen} tone={inSession ? 'session' : undefined}>
      <DateCell value={showDate ? event.performed_at : null} />
      {inSession ? <SessionThread /> : <WrenchIcon />}
      <ServiceCell event={event} showTime={!inSession} sessionLink={sessionLink} onOpenSession={onOpenSession} />
      {fields.map((field) => (
        <FieldCell key={field} event={event} field={field} />
      ))}
      <span />
    </DataListRow>
  )
}

// A service session's header: "Service session" with its time and count
// chip, the session note under it, its bike in the Bike column and "View
// session ›" at the end. Opens ServiceSessionViewModal.
export function SessionHeaderRow({
  session,
  countLabel,
  showDate,
  fields,
  onOpen,
}: {
  session: MaintenanceLogSession
  countLabel: string
  showDate: boolean
  fields: MaintenanceField[]
  onOpen: () => void
}) {
  return (
    <DataListRow ariaLabel={sessionAccessibleName(session, countLabel)} onOpen={onOpen} tone="session">
      <DateCell value={showDate ? session.performed_at : null} />
      <WrenchIcon />
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            Service session
          </Text>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {timeLabel(session.performed_at)}
          </Text>
          <Badge size="sm" variant="light" color="teal" tt="none" style={{ flexShrink: 0 }}>
            {countLabel}
          </Badge>
        </Group>
        {session.notes && (
          <Text size="xs" c="dimmed" truncate>
            {session.notes}
          </Text>
        )}
      </Stack>
      {fields.map((field) =>
        field === 'bike' ? (
          <Text key={field} size="sm" truncate c={session.bike ? undefined : 'dimmed'}>
            {session.bike?.name ?? 'Off the bike'}
          </Text>
        ) : (
          <span key={field} />
        ),
      )}
      <Text size="sm" c="var(--mantine-primary-color-filled)" fw={500} ta="right" style={{ whiteSpace: 'nowrap' }}>
        View session ›
      </Text>
    </DataListRow>
  )
}
