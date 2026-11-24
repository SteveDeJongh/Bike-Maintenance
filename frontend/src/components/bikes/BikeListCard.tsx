import { Badge, Box, Divider, Group, Paper, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import BikeStatusChip from '../bike/BikeStatusChip'
import WearBar from '../dashboard/WearBar'
import { lastRideLine } from '../../utils/bikeCard'
import { moreComponentsLine } from './bikesList'
import { formatDistance } from '../../utils/distance'
import { formatPower } from '../../utils/power'
import { componentWearValue } from '../../utils/wear'
import type { BikeWithStats } from '../../types/models'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={500}>
        {value}
      </Text>
    </Stack>
  )
}

// One bike on the Bikes page: the whole card links to the bike. Header
// (name, type chip, make/model, status chip), the stats line, up to three
// mounted components (next_service) and the last ride, pinned to the bottom
// so it lines up across a row of cards (the grid stretches each card). Unlike Home's BikeCard
// it has nothing clickable inside, so the whole card can be one link.
export default function BikeListCard({ bike, typeName }: { bike: BikeWithStats; typeName: string | null }) {
  const makeModel = [bike.make, bike.model].filter(Boolean).join(' ')
  // Plain text, not a link: the whole card is already one.
  const more = moreComponentsLine(bike.installed_components_count, bike.next_service.length)

  return (
    <Paper
      component={Link}
      to={`/bikes/${bike.id}`}
      withBorder
      radius="md"
      p="md"
      className="bike-list-card"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Stack gap="sm" style={{ flex: 1 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <Text fw={700} size="lg" truncate>
                {bike.name}
              </Text>
              {typeName && (
                <Badge size="sm" variant="default" tt="none" fw={500} style={{ flexShrink: 0 }}>
                  {typeName}
                </Badge>
              )}
            </Group>
            {makeModel && (
              <Text size="sm" c="dimmed" truncate>
                {makeModel}
              </Text>
            )}
          </Stack>
          <BikeStatusChip {...bike.status_counts} />
        </Group>

        <Divider />
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Stat label="Total" value={formatDistance(bike.total_distance)} />
          <Stat label="This year" value={formatDistance(bike.distance_this_year)} />
          <Stat label="Rides" value={bike.ride_count.toLocaleString()} />
          <Stat label="Avg power" value={formatPower(bike.average_power)} />
        </Group>
        <Divider />

        <Stack gap={6}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.04em' }}>
            Components
          </Text>
          {bike.installed_components_count === 0 ? (
            <Text size="sm" c="dimmed">
              No components installed.
            </Text>
          ) : (
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.2fr) minmax(48px, 1fr) auto',
                alignItems: 'center',
                columnGap: 'var(--mantine-spacing-sm)',
                rowGap: 6,
              }}
            >
              {bike.next_service.map((component) => (
                <Box key={component.component_id} style={{ display: 'contents' }}>
                  <Text size="sm" truncate>
                    {component.label}
                  </Text>
                  {/* No requirement: a faint empty track, so bars line up. */}
                  <WearBar
                    fraction={component.fraction_used}
                    status={component.service_status}
                    style={component.driving_dimension ? undefined : { opacity: 0.5 }}
                  />
                  <Text
                    size="sm"
                    ta="right"
                    c={component.service_status === 'due' ? 'red' : 'dimmed'}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {componentWearValue(component)}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
          {more && (
            <Text size="sm" c="dimmed">
              {more}
            </Text>
          )}
        </Stack>

        <Text size="xs" c="dimmed" style={{ marginTop: 'auto' }}>
          {lastRideLine(bike)}
        </Text>
      </Stack>
    </Paper>
  )
}
