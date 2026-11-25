import { Button, Stack, Text } from '@mantine/core'

// Nothing logged at all (no last service, whatever the filters -- the
// default This year range can hide older ones), or nothing these filters
// keep.
export default function EmptyState({
  nothingLogged,
  onClearFilters,
  onLogService,
}: {
  nothingLogged: boolean
  onClearFilters: () => void
  onLogService: () => void
}) {
  return (
    <Stack align="center" gap="sm" py="md">
      <Text c="dimmed">{nothingLogged ? 'No services logged yet' : 'No services match these filters'}</Text>
      {!nothingLogged ? (
        <Button variant="default" size="xs" radius="xl" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : (
        <Button variant="outline" size="xs" onClick={onLogService}>
          Log service
        </Button>
      )}
    </Stack>
  )
}
