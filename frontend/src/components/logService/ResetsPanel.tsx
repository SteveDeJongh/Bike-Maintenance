import { Anchor, Box, Group, Paper, Stack, Text } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import WearBar from '../dashboard/WearBar'
import { resetRows, resetsTitle } from './logServiceModel'
import type { ComponentServiceRequirementWithStatus } from '../../types/models'

// The inset "What this resets" panel: per enabled requirement, its name
// and rule, the current wear bar, and what this service does to it --
// the bar, an arrow and a near-empty teal bar with "196 km → 0 · resets"
// when the type is one of its satisfiers, else "Not affected". Editing,
// it reads as what the service did ("Reset at 1,160 km"), bars dimmed.
export default function ResetsPanel({
  componentId,
  requirements,
  serviceTypeId,
  isEdit,
  distanceAtServiceMeters,
  onNavigate,
}: {
  componentId: number
  requirements: readonly ComponentServiceRequirementWithStatus[]
  serviceTypeId: number | null
  isEdit: boolean
  distanceAtServiceMeters: number
  onNavigate: () => void
}) {
  const rows = resetRows(requirements, serviceTypeId, isEdit ? { kind: 'edit', distanceAtServiceMeters } : { kind: 'log' })

  return (
    <Paper radius="md" p="sm" bg="var(--mantine-color-default-hover)">
      <Text size="xs" c="dimmed" tt="uppercase" fw={500} mb="xs" style={{ letterSpacing: '0.04em' }}>
        {resetsTitle(isEdit)}
      </Text>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No service intervals on this component.{' '}
          <Anchor component={Link} to={`/components/${componentId}#intervals`} size="sm" onClick={onNavigate}>
            Set up intervals
          </Anchor>
        </Text>
      ) : (
        <Stack gap="sm">
          {rows.map((row) => (
            <Group key={row.id} gap="sm" wrap="nowrap" align="center">
              <Stack gap={0} style={{ flex: '1 1 0', minWidth: 0 }}>
                <Text size="sm" fw={500} c={row.resets ? undefined : 'dimmed'} truncate>
                  {row.name}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {row.rule}
                </Text>
              </Stack>
              <Group gap={6} wrap="nowrap" style={{ flex: '1 1 0', minWidth: 90 }} opacity={isEdit ? 0.5 : 1}>
                <WearBar fraction={row.fraction} status={row.status} style={{ flex: 1 }} />
                {row.resets && !isEdit && (
                  <>
                    <IconArrowRight size={14} color="var(--mantine-color-teal-6)" style={{ flexShrink: 0 }} />
                    <Box style={{ flex: 1 }}>
                      <WearBar fraction={0.03} status="ok" />
                    </Box>
                  </>
                )}
              </Group>
              <Text
                size="xs"
                c={row.resets ? 'teal' : 'dimmed'}
                fw={row.resets ? 500 : undefined}
                ta="right"
                style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
              >
                {row.outcome}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  )
}
