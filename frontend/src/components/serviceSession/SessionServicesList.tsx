import { Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { ResetChips, WrenchIcon } from '../service/ServiceMarks'
import { componentCountLabel, eventDistanceLines } from './sessionModel'
import type { ServiceSessionEvent } from '../../types/models'

// The session's services, in both states: "Services" with "N components",
// then one bordered row per service -- wrench | "Drip wax · Chain S1" with
// its reset chips and note | "at 1,160 km" over "200 km since last" | a
// chevron. A row opens the component page at that service (?event=<id>)
// and closes the modal.
export default function SessionServicesList({ events, onOpen }: { events: ServiceSessionEvent[]; onOpen: () => void }) {
  const navigate = useNavigate()

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          Services
        </Text>
        <Text size="xs" c="dimmed">
          {componentCountLabel(events)}
        </Text>
      </Group>
      <Paper withBorder radius="md">
        {events.map((event, index) => {
          const distance = eventDistanceLines(event)
          return (
            <UnstyledButton
              key={event.id}
              className="data-list-row"
              aria-label={`${event.service_type.name}, ${event.component.label}, open`}
              onClick={() => {
                onOpen()
                navigate(`/components/${event.component.id}?event=${event.id}`)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                borderTop: index === 0 ? undefined : '1px solid var(--mantine-color-default-border)',
              }}
            >
              <Group gap="sm" wrap="nowrap">
                <WrenchIcon size={28} />
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="wrap">
                    <Text size="sm" fw={500}>
                      {event.service_type.name}{' '}
                      <Text span inherit c="dimmed" fw={400}>
                        · {event.component.label}
                      </Text>
                    </Text>
                    <ResetChips names={event.resets} />
                  </Group>
                  {event.notes && (
                    <Text size="xs" c="dimmed" truncate>
                      {event.notes}
                    </Text>
                  )}
                </Stack>
                <Stack gap={0} align="flex-end" style={{ flexShrink: 0 }}>
                  <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
                    {distance.at}
                  </Text>
                  {distance.since && (
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {distance.since}
                    </Text>
                  )}
                </Stack>
                <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
              </Group>
            </UnstyledButton>
          )
        })}
      </Paper>
      <Text size="xs" c="dimmed">
        To change one service's type or note, open it from its component. To take one out, delete it there.
      </Text>
    </Stack>
  )
}
