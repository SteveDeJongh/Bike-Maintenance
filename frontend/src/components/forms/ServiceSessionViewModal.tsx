import { useEffect, useRef, useState } from 'react'
import { Alert, Anchor, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { Link } from 'react-router-dom'
import AppModal from '../AppModal'
import ServiceNotesField from './ServiceNotesField'
import SessionServicesList from '../serviceSession/SessionServicesList'
import { WrenchIcon } from '../service/ServiceMarks'
import { useDeleteServiceSession, useUpdateServiceSession } from '../../api/mutations'
import { useServiceSession } from '../../api/queries'
import { confirmDelete } from '../confirmDelete'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import { isoUtcToDate, mantineLocalStringToIsoUtc } from '../../utils/datetime'
import { deleteSessionMessage, moveHint, sessionDateTitle, sessionEditError, sessionStats } from '../serviceSession/sessionModel'
import type { ServiceSession } from '../../types/models'

const KICKER = { size: 'xs', c: 'dimmed', fw: 500, style: { letterSpacing: '0.04em' } } as const

interface ServiceSessionViewModalProps {
  opened: boolean
  onClose: () => void
  sessionId: number
  // Leaving for another page (a service row, the bike link) closes this,
  // and, when given, the opener too -- the Log service modal, which this
  // stacks over.
  onNavigate?: () => void
}

// One service session (docs/service-requirements.md, "Batch service
// logging"): the header, then a view state (note, stats, Edit date and
// note, Delete session) that swaps in place for an editing state, and the
// session's services, each opening its component. Deliberately no
// per-service edit or remove here -- that's from the component. Editing
// only touches the session's date and note; every service's performed_at
// moves with it on the server (ServiceSession#sync_event_performed_at).
export default function ServiceSessionViewModal({ opened, onClose, sessionId, onNavigate }: ServiceSessionViewModalProps) {
  const leave = () => {
    onClose()
    onNavigate?.()
  }
  return (
    <AppModal opened={opened} onClose={onClose} title={<SessionTitle sessionId={sessionId} onNavigate={leave} />}>
      {opened && <ServiceSessionView sessionId={sessionId} onClose={onClose} onLeave={leave} />}
    </AppModal>
  )
}

// A 40px wrench beside "SERVICE SESSION · <bike>" (the bike linked, not
// uppercased) over "Sat, Nov 14, 2026 · 4:10 pm".
function SessionTitle({ sessionId, onNavigate }: { sessionId: number; onNavigate: () => void }) {
  const { data: session } = useServiceSession(sessionId)
  return (
    <Group gap="sm" wrap="nowrap">
      <WrenchIcon size={40} />
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text {...KICKER}>
          <Text span inherit tt="uppercase">
            Service session
          </Text>
          {session && (
            <>
              {' · '}
              <Anchor component={Link} to={`/bikes/${session.bike.id}`} size="xs" onClick={onNavigate}>
                {session.bike.name}
              </Anchor>
            </>
          )}
        </Text>
        <Text fz="lg" fw={700} lh={1.25}>
          {session ? sessionDateTitle(session.performed_at) : 'Service session'}
        </Text>
      </Stack>
    </Group>
  )
}

function ServiceSessionView({ sessionId, onClose, onLeave }: { sessionId: number; onClose: () => void; onLeave: () => void }) {
  const { data: session, isPending, isError, error } = useServiceSession(sessionId)
  const [editing, setEditing] = useState(false)

  if (isPending) return <Loader />

  if (isError) {
    return (
      <Alert color="red" title="Failed to load this service session">
        {error.message}
      </Alert>
    )
  }

  return (
    <Stack>
      {editing ? (
        <SessionEditor session={session} onDone={() => setEditing(false)} />
      ) : (
        <SessionSummary session={session} onEdit={() => setEditing(true)} onDeleted={onClose} />
      )}
      <SessionServicesList events={session.events} onOpen={onLeave} />
    </Stack>
  )
}

function SessionSummary({ session, onEdit, onDeleted }: { session: ServiceSession; onEdit: () => void; onDeleted: () => void }) {
  const deleteSession = useDeleteServiceSession()
  const stats = sessionStats(session)
  const tap = useIsMobile() ? MOBILE_TAP_TARGET_STYLE : undefined

  function handleDelete() {
    confirmDelete({
      title: 'Delete service session',
      message: deleteSessionMessage(session.events.length),
      onConfirm: () => deleteSession.mutate(session.id, { onSuccess: onDeleted }),
    })
  }

  return (
    <Stack gap="sm">
      {session.notes && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {session.notes}
        </Text>
      )}
      {stats.length > 0 && (
        <Group gap="lg" wrap="wrap">
          {stats.map((stat) => (
            <Stack key={stat.label} gap={0}>
              <Text size="xs" c="dimmed">
                {stat.label}
              </Text>
              <Text size="sm" fw={500}>
                {stat.value}
              </Text>
            </Stack>
          ))}
        </Group>
      )}
      <Group gap="sm">
        <Button size="xs" variant="outline" onClick={onEdit} style={tap}>
          Edit date and note
        </Button>
        <Button size="xs" variant="outline" color="red" onClick={handleDelete} loading={deleteSession.isPending} style={tap}>
          Delete session
        </Button>
      </Group>
    </Stack>
  )
}

// The editing state, in place of the summary: Done on (focused) with what
// moving it means, the note, Cancel / Save. A rejected save (a 422 naming
// the components that wouldn't qualify at the new time) shows under the
// date and keeps the edits.
function SessionEditor({ session, onDone }: { session: ServiceSession; onDone: () => void }) {
  const updateSession = useUpdateServiceSession(session.id)
  const [performedAt, setPerformedAt] = useState(session.performed_at)
  const [notes, setNotes] = useState(session.notes ?? '')
  const [dateError, setDateError] = useState<string | null>(null)
  const dateRef = useRef<HTMLButtonElement>(null)
  useEffect(() => dateRef.current?.focus(), [])

  function handleSave() {
    setDateError(null)
    updateSession.mutate(
      { performed_at: performedAt, notes: notes.trim() || null },
      { onSuccess: onDone, onError: (err) => setDateError(sessionEditError(err)) },
    )
  }

  return (
    <Paper radius="md" p="sm" bg="var(--mantine-color-default-hover)">
      <Stack gap="sm">
        <Stack gap={4}>
          <DateTimePicker
            label="Done on"
            required
            ref={dateRef}
            value={isoUtcToDate(performedAt)}
            onChange={(value) => {
              const iso = mantineLocalStringToIsoUtc(value)
              if (iso) setPerformedAt(iso)
            }}
            error={dateError}
          />
          <Text size="xs" c="dimmed">
            {moveHint(session.events.length, session.bike.name)}
          </Text>
        </Stack>
        <ServiceNotesField label="Note" placeholder="" value={notes} onChange={setNotes} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={updateSession.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
