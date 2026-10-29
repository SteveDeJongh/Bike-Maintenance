import { useState } from 'react'
import { Button, Divider, Group, Modal, Stack, Text } from '@mantine/core'
import ComponentIdentityStatus from '../ComponentIdentityStatus'
import ComponentServiceAndHistory from '../ComponentServiceAndHistory'
import EditInstallationModal from './EditInstallationModal'
import { RIDE_CONTEXT_LABELS } from '../../constants'
import { formatDateTime } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { ComponentAssignmentWithStats } from '../../types/models'

interface AssignmentDetailModalProps {
  opened: boolean
  onClose: () => void
  assignment: ComponentAssignmentWithStats | null
}

export default function AssignmentDetailModal({ opened, onClose, assignment }: AssignmentDetailModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={assignment?.component.label ?? ''} size="xl">
      {opened && assignment && <AssignmentDetailContent key={assignment.id} assignment={assignment} />}
    </Modal>
  )
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

function AssignmentDetailContent({ assignment }: { assignment: ComponentAssignmentWithStats }) {
  const [editOpened, setEditOpened] = useState(false)

  return (
    <Stack>
      <ComponentIdentityStatus componentId={assignment.component_id} />

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

      <Divider label="Installation details" labelPosition="left" />
      <Group gap="xl">
        <Stat label="Installed on" value={formatDateTime(assignment.started_at)} />
        {assignment.ended_at && <Stat label="Uninstalled on" value={formatDateTime(assignment.ended_at)} />}
        <Stat label="Ride context" value={RIDE_CONTEXT_LABELS[assignment.ride_context]} />
      </Group>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => setEditOpened(true)}>
          Edit installation
        </Button>
      </Group>

      <Divider label="Service intervals & maintenance history" labelPosition="left" />
      <ComponentServiceAndHistory componentId={assignment.component_id} />

      <EditInstallationModal opened={editOpened} onClose={() => setEditOpened(false)} assignment={assignment} />
    </Stack>
  )
}
