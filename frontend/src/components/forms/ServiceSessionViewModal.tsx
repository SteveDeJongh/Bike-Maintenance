import { useState } from 'react'
import { Alert, Anchor, Button, Divider, Group, Loader, Modal, Stack, Table, Text, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { Link } from 'react-router-dom'
import { useDeleteServiceSession, useUpdateServiceSession } from '../../api/mutations'
import { useComponents, useServiceSession, useServiceTypes } from '../../api/queries'
import { formatApiError } from '../../api/errors'
import { confirmDelete } from '../confirmDelete'
import { formatDateTime, isoUtcToDate, mantineLocalStringToIsoUtc } from '../../utils/datetime'

interface ServiceSessionViewModalProps {
  opened: boolean
  onClose: () => void
  sessionId: number
}

// Opened from the "Part of a service session" marker on a history row
// (ComponentServiceAndHistory). Deliberately no per-event remove here --
// delete the event itself and re-log it instead, same as the rest of this
// feature. Edit only ever touches the session's own date/note; every
// event's own performed_at moves in step on the server (ServiceSession#sync_event_performed_at).
export default function ServiceSessionViewModal({ opened, onClose, sessionId }: ServiceSessionViewModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Service session">
      {opened && <ServiceSessionView sessionId={sessionId} onClose={onClose} />}
    </Modal>
  )
}

function ServiceSessionView({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const { data: session, isPending, isError, error } = useServiceSession(sessionId)
  const { data: components } = useComponents()
  const { data: serviceTypes } = useServiceTypes()
  const updateSession = useUpdateServiceSession(sessionId)
  const deleteSession = useDeleteServiceSession()

  const [editing, setEditing] = useState(false)
  const [performedAt, setPerformedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  if (isPending) return <Loader />

  if (isError) {
    return (
      <Alert color="red" title="Failed to load this service session">
        {error.message}
      </Alert>
    )
  }

  if (!session) return null

  function componentLabel(componentId: number) {
    return components?.find((c) => c.id === componentId)?.label ?? `Component #${componentId}`
  }

  function serviceTypeName(serviceTypeId: number) {
    return serviceTypes?.find((t) => t.id === serviceTypeId)?.name ?? `Service type #${serviceTypeId}`
  }

  // Non-null assertions below: TS doesn't carry the `if (!session) return
  // null` guard's narrowing into these nested function declarations, but
  // they're only ever invoked from the JSX rendered after that guard, so
  // session is always present by the time they run.
  function startEditing() {
    setPerformedAt(session!.performed_at)
    setNotes(session!.notes ?? '')
    setFormError(null)
    setEditing(true)
  }

  function handleSave() {
    updateSession.mutate(
      { performed_at: performedAt, notes: notes.trim() || null },
      { onSuccess: () => setEditing(false), onError: (err) => setFormError(formatApiError(err)) },
    )
  }

  function handleDelete() {
    const eventCount = session!.events.length
    confirmDelete({
      title: 'Delete service session',
      message: `Delete this service session and its ${eventCount} ${eventCount === 1 ? 'event' : 'events'}? This cannot be undone.`,
      onConfirm: () => deleteSession.mutate(session!.id, { onSuccess: onClose }),
    })
  }

  return (
    <Stack>
      {editing ? (
        <Stack>
          <DateTimePicker
            label="Performed at"
            required
            value={isoUtcToDate(performedAt)}
            onChange={(value) => {
              const iso = mantineLocalStringToIsoUtc(value)
              if (iso) setPerformedAt(iso)
            }}
          />
          <Textarea label="Note" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
          {formError && <Alert color="red">{formError}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={updateSession.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      ) : (
        <>
          <Group justify="space-between">
            <div>
              <Text fw={500}>{formatDateTime(session.performed_at)}</Text>
              {session.notes && (
                <Text size="sm" c="dimmed">
                  {session.notes}
                </Text>
              )}
            </div>
            <Button size="xs" variant="default" onClick={startEditing}>
              Edit
            </Button>
          </Group>

          <Divider />

          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Component</Table.Th>
                <Table.Th>Service</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {session.events.map((event) => (
                <Table.Tr key={event.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/components/${event.component_id}`}>
                      {componentLabel(event.component_id)}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{serviceTypeName(event.service_type_id)}</Table.Td>
                  <Table.Td>{event.notes ?? ''}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Group justify="flex-end">
            <Button variant="subtle" color="red" onClick={handleDelete} loading={deleteSession.isPending}>
              Delete session
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}
