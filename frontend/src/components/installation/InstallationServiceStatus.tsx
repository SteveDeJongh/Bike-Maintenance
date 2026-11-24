import { Anchor, Box, Group, Stack, Text } from '@mantine/core'
import SmallLabel from './SmallLabel'
import WearBar from '../dashboard/WearBar'
import { SERVICE_STATUS_COLORS } from '../../constants'
import { intervalCountLabel, serviceStatusRows } from './installationModel'
import type { ComponentDetail } from '../../types/models'

// A current installation's read-only service status: one compact row per
// enabled interval -- name and "Last done …" | wear bar | what's left, in
// the status colour. Editing lives on the component page, which the empty
// state links to (its #intervals section).
export default function InstallationServiceStatus({
  component,
  onNavigate,
}: {
  component: ComponentDetail
  onNavigate: (to: string) => void
}) {
  const rows = serviceStatusRows(component.service_requirements)

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <SmallLabel>Service status</SmallLabel>
        {rows.length > 0 && (
          <Text size="xs" c="dimmed">
            {intervalCountLabel(rows.length)}
          </Text>
        )}
      </Group>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No service intervals.{' '}
          <Anchor component="button" type="button" size="sm" onClick={() => onNavigate(`/components/${component.id}#intervals`)}>
            Add one on the component page
          </Anchor>
        </Text>
      ) : (
        rows.map((row) => (
          <Box
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.4fr) minmax(60px, 1fr) auto',
              alignItems: 'center',
              columnGap: 'var(--mantine-spacing-sm)',
            }}
          >
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {row.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {row.lastDone}
              </Text>
            </Stack>
            <WearBar fraction={row.fraction} status={row.status} />
            <Text
              size="sm"
              fw={500}
              ta="right"
              c={row.status === 'ok' ? 'dimmed' : SERVICE_STATUS_COLORS[row.status]}
              style={{ whiteSpace: 'nowrap' }}
            >
              {row.remaining}
            </Text>
          </Box>
        ))
      )}
    </Stack>
  )
}
