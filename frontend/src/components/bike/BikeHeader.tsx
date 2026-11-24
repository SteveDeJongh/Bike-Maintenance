import { Group, Text } from '@mantine/core'
import { formatDate } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { BikeDetail as BikeDetailData } from '../../types/models'

// The bike page's plain stats row (replaced by the tiles in the next step).
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
