import { Badge, Box, Group, Text } from '@mantine/core'
import { categoryLabel } from '../constants'

// The dashed "All categories" pill: what an untagged (universal) service
// type shows instead of category tags.
export function AllCategoriesPill() {
  return (
    <Box
      px={8}
      py={1}
      style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-xl)' }}
    >
      <Text size="xs" c="dimmed" lh={1.6}>
        All categories
      </Text>
    </Box>
  )
}

// A service type's tags as small neutral pills, or the dashed pill when it
// has none.
export function ServiceTypeTagPills({ categories }: { categories: string[] }) {
  if (categories.length === 0) return <AllCategoriesPill />

  return (
    <Group gap={4} wrap="wrap">
      {categories.map((category) => (
        <Badge key={category} size="sm" variant="default" tt="none" fw={500}>
          {categoryLabel(category)}
        </Badge>
      ))}
    </Group>
  )
}
