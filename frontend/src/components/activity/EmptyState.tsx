import { Anchor, Group, Text } from '@mantine/core'
import { Link } from 'react-router-dom'

export default function EmptyState({ hasActiveFilters, onClearFilters }: { hasActiveFilters: boolean; onClearFilters: () => void }) {
  if (hasActiveFilters) {
    return (
      <Group gap="xs">
        <Text c="dimmed">Nothing matches these filters.</Text>
        <Anchor component="button" type="button" size="sm" onClick={onClearFilters}>
          Clear filters
        </Anchor>
      </Group>
    )
  }

  return (
    <Text c="dimmed">
      No activity yet.{' '}
      <Anchor component={Link} to="/strava">
        Connect or sync Strava
      </Anchor>{' '}
      to pull in your rides.
    </Text>
  )
}
