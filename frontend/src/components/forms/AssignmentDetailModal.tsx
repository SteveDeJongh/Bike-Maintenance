import { useState } from 'react'
import { Alert, Anchor, Button, Divider, Group, Loader, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useBike, useComponent } from '../../api/queries'
import AppModal from '../AppModal'
import ComponentSwapPill from '../ComponentSwapPill'
import WhereItIs from '../installation/WhereItIs'
import { installationActions, whereItIs } from '../installation/installationModel'
import MaintenanceEventFormModal from './MaintenanceEventFormModal'
import ComponentServiceAndHistory from '../ComponentServiceAndHistory'
import EditInstallationModal from './EditInstallationModal'
import EndAssignmentModal from './EndAssignmentModal'
import { categoryLabel } from '../../constants'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { ComponentAssignmentWithStats } from '../../types/models'

interface AssignmentDetailModalProps {
  opened: boolean
  onClose: () => void
  bikeId: number
  assignmentId: number | null
  // Where to send the user when the assignment can't be found once the
  // bike has loaded (e.g. the Activity list's setup rows).
  fallbackComponentId?: number
}

// One installation's detail -- opened from the bike page's rows and the
// dashboard's bike cards alike. It loads its own data from the bike's
// GET /bikes/:id (already cached on the bike page; fetched on open from
// the dashboard) and picks the assignment by id. After a swap from the
// pill it follows the slot: it switches to the new assignment and waits
// for the refetch rather than showing the ended one.
export default function AssignmentDetailModal({ opened, onClose, bikeId, assignmentId, fallbackComponentId }: AssignmentDetailModalProps) {
  const [currentId, setCurrentId] = useState(assignmentId)
  const [prevAssignmentId, setPrevAssignmentId] = useState(assignmentId)
  if (assignmentId !== prevAssignmentId) {
    setPrevAssignmentId(assignmentId)
    setCurrentId(assignmentId)
  }

  return (
    <AppModal opened={opened} onClose={onClose} title={<ModalTitle bikeId={bikeId} assignmentId={currentId} opened={opened} />} size="xl">
      {opened && currentId != null && (
        <AssignmentLoader
          key={currentId}
          bikeId={bikeId}
          assignmentId={currentId}
          onSwapped={setCurrentId}
          fallbackComponentId={fallbackComponentId}
        />
      )}
    </AppModal>
  )
}

function useAssignment(bikeId: number, assignmentId: number | null, enabled: boolean) {
  const bike = useBike(enabled ? bikeId : NaN)
  const assignment = bike.data?.component_assignments.find((a) => a.id === assignmentId) ?? null
  return { bike, assignment }
}

// "INSTALLATION · CHAIN" over the component's label, like the ride modal's
// lifted title; Mantine's close button stays on the right.
function ModalTitle({ bikeId, assignmentId, opened }: { bikeId: number; assignmentId: number | null; opened: boolean }) {
  const { assignment } = useAssignment(bikeId, assignmentId, opened)
  if (!assignment) return null
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
        Installation · {categoryLabel(assignment.component.category)}
      </Text>
      <Text fz="lg" fw={700} lh={1.25} style={{ overflowWrap: 'anywhere' }}>
        {assignment.component.label}
      </Text>
    </Stack>
  )
}

function AssignmentLoader({
  bikeId,
  assignmentId,
  onSwapped,
  fallbackComponentId,
}: {
  bikeId: number
  assignmentId: number
  onSwapped: (id: number) => void
  fallbackComponentId?: number
}) {
  const { bike, assignment } = useAssignment(bikeId, assignmentId, true)

  if (bike.error) {
    return (
      <Alert color="red" title="Failed to load installation">
        {bike.error.message}
      </Alert>
    )
  }
  // Right after a swap the new assignment isn't in the cached bike yet --
  // keep loading until the refetch brings it in. Once the bike has settled
  // without it, it isn't coming: say so, and offer the component instead.
  if (!assignment) {
    if (bike.data && !bike.isFetching) {
      return (
        <Stack gap="xs">
          <Text c="dimmed">This installation isn't available.</Text>
          {fallbackComponentId != null && (
            <Anchor component={Link} to={`/components/${fallbackComponentId}`}>
              Open the component
            </Anchor>
          )}
        </Stack>
      )
    }
    return <Loader />
  }

  return <AssignmentDetailContent assignment={assignment} bikeName={bike.data?.name ?? ''} onSwapped={onSwapped} />
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={500}>{value}</Text>
    </div>
  )
}

function AssignmentDetailContent({
  assignment,
  bikeName,
  onSwapped,
}: {
  assignment: ComponentAssignmentWithStats
  bikeName: string
  onSwapped: (id: number) => void
}) {
  const { data: component } = useComponent(assignment.component_id)
  const [logOpened, setLogOpened] = useState(false)
  const [editOpened, setEditOpened] = useState(false)
  const [removeOpened, setRemoveOpened] = useState(false)
  const where = whereItIs(assignment, bikeName, component?.current_bikes)
  const actions = installationActions(assignment)

  return (
    <Stack>
      <WhereItIs where={where} />

      {where.kind === 'current' && (
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
            Swap
          </Text>
          <ComponentSwapPill assignment={assignment} onSwapped={(newAssignment) => onSwapped(newAssignment.id)} />
        </Group>
      )}

      {/* Remove from bike lives here (the bike page's rows have no
          buttons): the EndAssignmentModal flow -- an end date defaulting to
          now. Only an open installation can be removed or logged against. */}
      <Group gap="xs" wrap="wrap">
        {actions.includes('log_service') && (
          <Button size="sm" onClick={() => setLogOpened(true)}>
            Log service
          </Button>
        )}
        {actions.includes('edit') && (
          <Button size="sm" variant="default" onClick={() => setEditOpened(true)}>
            Edit installation
          </Button>
        )}
        {actions.includes('remove') && (
          <Button size="sm" variant="outline" color="red" onClick={() => setRemoveOpened(true)}>
            Remove from bike
          </Button>
        )}
      </Group>

      <Divider label="This installation" labelPosition="left" />
      <Group gap="xl">
        <Stat label="Distance" value={formatDistance(assignment.distance_meters)} />
        <Stat label="Time" value={formatDuration(assignment.moving_time)} />
        <Stat label="Elevation" value={formatElevation(assignment.elevation_gain)} />
        <Stat label="Avg Power" value={formatPower(assignment.average_power)} />
      </Group>

      <Divider label="Lifetime (all installations)" labelPosition="left" />
      <Group gap="xl">
        <Stat label="Total Distance" value={formatDistance(assignment.component.total_distance)} />
        <Stat label="Total Time" value={formatDuration(assignment.component.total_moving_time)} />
        <Stat label="Total Elevation" value={formatElevation(assignment.component.total_elevation_gain)} />
        <Stat label="Total Avg Power" value={formatPower(assignment.component.average_power)} />
      </Group>


      <Divider label="Service intervals & maintenance history" labelPosition="left" />
      <ComponentServiceAndHistory componentId={assignment.component_id} />

      <MaintenanceEventFormModal
        opened={logOpened}
        onClose={() => setLogOpened(false)}
        defaultComponentId={assignment.component_id}
      />
      <EditInstallationModal opened={editOpened} onClose={() => setEditOpened(false)} assignment={assignment} />
      <EndAssignmentModal
        opened={removeOpened}
        onClose={() => setRemoveOpened(false)}
        assignment={removeOpened ? assignment : null}
        componentLabel={assignment.component.label}
      />
    </Stack>
  )
}
