import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Anchor, Button, Group, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { useSearchParams } from 'react-router-dom'
import { useComponent, useMaintenanceEvents, useServiceTypes } from '../api/queries'
import MaintenanceEventFormModal from './forms/MaintenanceEventFormModal'
import ServiceSessionViewModal from './forms/ServiceSessionViewModal'
import ServiceIntervalsSection from './ServiceIntervalsSection'
import { formatDateTime } from '../utils/datetime'
import type { MaintenanceEvent } from '../types/models'

// Shared by the standalone ComponentDetail page and the Bike page's
// AssignmentDetailModal -- service intervals (add/edit/remove/log a
// service against any of them) and the full maintenance history with its
// own "+ Log maintenance event" button. Fetches its own data from just a
// componentId so either caller can drop it in without threading props
// through.
export default function ComponentServiceAndHistory({ componentId }: { componentId: number }) {
  const { data: component, isPending, error } = useComponent(componentId)
  const { data: events } = useMaintenanceEvents()
  const { data: serviceTypes } = useServiceTypes()
  const [logOpened, setLogOpened] = useState(false)
  const [viewingSessionId, setViewingSessionId] = useState<number | null>(null)
  // The Activity log's maintenance_event rows link here as ?event=<id> --
  // same scroll-and-highlight convention as Strava.tsx's own ?gear=<id>.
  const [searchParams] = useSearchParams()
  const highlightedEventId = searchParams.get('event') ? Number(searchParams.get('event')) : null

  const history = useMemo(() => {
    return (events ?? [])
      .filter((event) => event.component_id === componentId)
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
  }, [events, componentId])

  // Counts every event in a session, not just this component's own --
  // a session can span several components on the same bike -- so the
  // marker's "N items" matches what the session view itself will show.
  const sessionCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const event of events ?? []) {
      if (event.service_session_id != null) {
        counts[event.service_session_id] = (counts[event.service_session_id] ?? 0) + 1
      }
    }
    return counts
  }, [events])

  if (isPending) return <Loader />

  if (error) {
    return (
      <Alert color="red" title="Failed to load component">
        {error.message}
      </Alert>
    )
  }

  if (!component) return null

  return (
    <Stack>
      <ServiceIntervalsSection component={component} />

      <Group justify="space-between">
        <Title order={4}>Maintenance history</Title>
        <Button size="sm" onClick={() => setLogOpened(true)}>
          + Log maintenance event
        </Button>
      </Group>

      {history.length === 0 && <Text c="dimmed">No maintenance events logged yet.</Text>}

      {history.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Performed At</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {history.map((event) => (
              <HistoryRow
                key={event.id}
                event={event}
                serviceTypeName={serviceTypes?.find((t) => t.id === event.service_type_id)?.name ?? ''}
                sessionCount={event.service_session_id != null ? sessionCounts[event.service_session_id] : undefined}
                highlighted={event.id === highlightedEventId}
                onViewSession={setViewingSessionId}
              />
            ))}
          </Table.Tbody>
        </Table>
      )}

      <MaintenanceEventFormModal
        opened={logOpened}
        onClose={() => setLogOpened(false)}
        defaultComponentId={componentId}
      />

      {viewingSessionId !== null && (
        <ServiceSessionViewModal
          opened
          onClose={() => setViewingSessionId(null)}
          sessionId={viewingSessionId}
        />
      )}
    </Stack>
  )
}

function HistoryRow({
  event,
  serviceTypeName,
  sessionCount,
  highlighted: initiallyHighlighted,
  onViewSession,
}: {
  event: MaintenanceEvent
  serviceTypeName: string
  sessionCount: number | undefined
  highlighted: boolean
  onViewSession: (sessionId: number) => void
}) {
  const rowRef = useRef<HTMLTableRowElement>(null)
  // Computed once at mount (not in an effect) so the highlight is already
  // active on first paint -- same convention as Strava.tsx's own gear-row
  // highlight. The prop is only ever read for that initial value; it isn't
  // expected to flip true->false->true across re-renders.
  const [highlighted, setHighlighted] = useState(initiallyHighlighted)

  useEffect(() => {
    if (!highlighted) return
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timeout = setTimeout(() => setHighlighted(false), 2000)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Table.Tr ref={rowRef} bg={highlighted ? 'var(--mantine-color-yellow-light)' : undefined}>
      <Table.Td>{formatDateTime(event.performed_at)}</Table.Td>
      <Table.Td>{serviceTypeName}</Table.Td>
      <Table.Td>
        {event.notes ?? ''}
        {event.service_session_id != null && (
          <div>
            <Anchor
              component="button"
              type="button"
              size="xs"
              c="dimmed"
              onClick={() => onViewSession(event.service_session_id!)}
            >
              Part of a service session · {sessionCount} items
            </Anchor>
          </div>
        )}
      </Table.Td>
    </Table.Tr>
  )
}
