import { Anchor, Badge, Box, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import LogServiceForItemButton from '../dashboard/LogServiceForItemButton'
import WearBar from '../dashboard/WearBar'
import { SERVICE_STATUS_COLORS } from '../../constants'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatDrivingRemaining } from '../../utils/serviceInterval'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import { formatUsedOfTotal, upNextItems } from '../../utils/upNext'
import type { BikeDetail, DashboardRequirementItem } from '../../types/models'

// "Up next on this bike": Home's Up next lists scoped to this bike's
// mounted parts (GET /bikes/:id overview) -- every due and warning item,
// then the nearest ok ones, five rows in all (upNextItems).
export default function BikeUpNext({ overview }: { overview: BikeDetail['overview'] }) {
  const items = upNextItems(overview.attention, overview.upcoming)
  const due = overview.attention.filter((item) => item.status === 'due').length
  const soon = overview.attention.filter((item) => item.status === 'warning').length

  return (
    <Paper withBorder p="md" radius="md" style={{ flex: '2 1 520px', minWidth: 0 }}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>Up next on this bike</Title>
          <Group gap="xs" wrap="nowrap">
            {due > 0 && <Badge color={SERVICE_STATUS_COLORS.due}>{due} due</Badge>}
            {soon > 0 && <Badge color={SERVICE_STATUS_COLORS.warning}>{soon} soon</Badge>}
          </Group>
        </Group>

        {items.length === 0 ? (
          <Text size="sm" c="dimmed">
            No service intervals on this bike yet.{' '}
            <Anchor component={Link} to="/settings/component-categories" size="sm">
              Set them up
            </Anchor>
          </Text>
        ) : (
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.6fr) minmax(60px, 1fr) auto auto',
              alignItems: 'center',
              columnGap: 'var(--mantine-spacing-sm)',
            }}
          >
            {items.map((item) => (
              <BikeUpNextRow key={`${item.component_id}-${item.requirement_id}`} item={item} />
            ))}
          </Box>
        )}
      </Stack>
    </Paper>
  )
}

// One requirement, as four cells of the card's grid so every bar lines up:
// the part and requirement over "196 / 200 km" | wear bar | what's left, in
// the status colour | Log service (Home's prefill, LogServiceForItemButton).
function BikeUpNextRow({ item }: { item: DashboardRequirementItem }) {
  const isMobile = useIsMobile()
  const color = SERVICE_STATUS_COLORS[item.status]
  const cell = { borderTop: '1px solid var(--mantine-color-default-border)', padding: '8px 0', height: '100%' }

  return (
    <>
      <Stack gap={0} style={{ ...cell, minWidth: 0, justifyContent: 'center' }}>
        <Text size="sm" truncate>
          <Text component={Link} to={`/components/${item.component_id}`} size="sm" fw={500} inherit>
            {item.component_label}
          </Text>
          <Text span c="dimmed" inherit>
            {' '}
            · {item.requirement_name}
          </Text>
        </Text>
        <Text size="xs" c="dimmed">
          {formatUsedOfTotal(item)}
        </Text>
      </Stack>
      <Box style={{ ...cell, display: 'flex', alignItems: 'center' }}>
        <WearBar fraction={item.fraction_used} status={item.status} style={{ width: '100%' }} />
      </Box>
      <Text size="sm" fw={600} c={color} ta="right" style={{ ...cell, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
        {formatDrivingRemaining(item)}
      </Text>
      <Box style={{ ...cell, display: 'flex', alignItems: 'center' }}>
        <LogServiceForItemButton item={item} size="compact-xs" variant="outline" style={isMobile ? MOBILE_TAP_TARGET_STYLE : undefined} />
      </Box>
    </>
  )
}
