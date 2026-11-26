import type { CSSProperties } from 'react'
import { Button, Menu, Stack, Text } from '@mantine/core'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { bikesByRecentRide } from '../maintenanceLog/maintenanceLogModel'
import type { BikeWithStats } from '../../types/models'

// "LOG SERVICE SESSION" over the bike as a pill; its menu lists active
// bikes, most recently ridden first. Picking one goes through the form's
// switchBike (which confirms when selections would be cleared).
export default function BatchServiceTitle({
  bikeId,
  bikes,
  onSwitch,
  tapStyle,
}: {
  bikeId: number
  bikes: BikeWithStats[] | undefined
  onSwitch: (bikeId: number) => void
  tapStyle?: CSSProperties
}) {
  const options = bikesByRecentRide(bikes)
  const current = bikes?.find((bike) => bike.id === bikeId)

  return (
    <Stack gap={4} align="flex-start">
      <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
        Log service session
      </Text>
      <Menu position="bottom-start" shadow="md" withinPortal>
        <Menu.Target>
          <Button
            size="sm"
            radius="xl"
            variant="default"
            rightSection={<IconChevronDown size={14} />}
            aria-label={`Bike: ${current?.name ?? 'choose'}. Change bike`}
            style={tapStyle}
          >
            <Text fw={700} size="md">
              {current?.name ?? 'Bike'}
            </Text>
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {options.map((bike) => (
            <Menu.Item
              key={bike.id}
              onClick={() => onSwitch(bike.id)}
              leftSection={bike.id === bikeId ? <IconCheck size={14} /> : <span style={{ width: 14 }} />}
            >
              {bike.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Stack>
  )
}
