import { useState } from 'react'
import { ActionIcon, Badge, Button, Group, Menu, Text, Title } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { useDeleteBike } from '../../api/mutations'
import { confirmDelete } from '../confirmDelete'
import BikeFormModal from '../forms/BikeFormModal'
import { formatDate } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { BikeDetail as BikeDetailData } from '../../types/models'

// Edit and Delete live in the "⋯" menu here: the Bikes list has no row
// actions (its rows and cards open this page).
export default function BikeHeader({ bike, onLogService }: { bike: BikeDetailData; onLogService: () => void }) {
  const navigate = useNavigate()
  const deleteBike = useDeleteBike()
  const [editOpened, setEditOpened] = useState(false)

  function handleDelete() {
    confirmDelete({
      title: 'Delete bike',
      message: `Delete "${bike.name}"? This also deletes all of its component assignment history.`,
      onConfirm: () => deleteBike.mutate(bike.id, { onSuccess: () => navigate('/bikes') }),
    })
  }

  return (
    <Group justify="space-between" align="flex-start">
      <div>
        <Group gap="sm">
          <Title order={2}>{bike.name}</Title>
          {bike.retired_on && <Badge color="gray">Retired</Badge>}
        </Group>
        <Text c="dimmed">{[bike.make, bike.model].filter(Boolean).join(' ') || 'Unknown make/model'}</Text>
      </div>
      <Group gap="xs" wrap="nowrap">
        <Button variant="default" onClick={onLogService}>
          Log service
        </Button>
        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon variant="default" size="lg" aria-label="Bike actions">
              <IconDots size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setEditOpened(true)}>Edit bike</Menu.Item>
            <Menu.Item color="red" onClick={handleDelete}>
              Delete bike
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <BikeFormModal opened={editOpened} onClose={() => setEditOpened(false)} bike={bike} />
    </Group>
  )
}

// Kept in this file rather than its own, alongside BikeHeader (not merged
// into it) -- MaintenanceAlertBanners renders between the two on the page,
// so the page must still place them separately to keep that exact order.
export function BikeStatsRow({ bike }: { bike: BikeDetailData }) {
  return (
    <Group gap="xl">
      <div>
        <Text size="sm" c="dimmed">
          Total distance
        </Text>
        <Text fw={500}>{formatDistance(bike.total_distance)}</Text>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Total time
        </Text>
        <Text fw={500}>{formatDuration(bike.total_moving_time)}</Text>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          First ride
        </Text>
        <Text fw={500}>{bike.first_ride_on ? formatDate(bike.first_ride_on) : 'No rides yet'}</Text>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Total elevation
        </Text>
        <Text fw={500}>{formatElevation(bike.total_elevation_gain)}</Text>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Avg power
        </Text>
        <Text fw={500}>{formatPower(bike.average_power)}</Text>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Installed components
        </Text>
        <Text fw={500}>{bike.installed_components_count}</Text>
      </div>
    </Group>
  )
}
