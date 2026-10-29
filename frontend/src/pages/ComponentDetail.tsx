import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Alert, Anchor, Badge, Button, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { ApiError } from '../api/client'
import { useComponent } from '../api/queries'
import ComponentFormModal from '../components/forms/ComponentFormModal'
import ComponentOverview from '../components/ComponentOverview'
import { categoryLabel } from '../constants'
import { formatDistance } from '../utils/distance'

export default function ComponentDetail() {
  const { id } = useParams<{ id: string }>()
  const componentId = Number(id)

  const { data: component, isPending, error } = useComponent(componentId)

  const [editOpened, setEditOpened] = useState(false)

  if (!Number.isFinite(componentId) || (error instanceof ApiError && error.status === 404)) {
    return (
      <Stack>
        <Text>Component not found.</Text>
        <Anchor component={Link} to="/components">
          Back to components
        </Anchor>
      </Stack>
    )
  }

  if (isPending) return <Loader />

  if (error) {
    return (
      <Alert color="red" title="Failed to load component">
        {error.message}
      </Alert>
    )
  }

  if (!component) return null

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Group gap="sm">
            <Title order={2}>{component.label}</Title>
            {component.retired_on && <Badge color="gray">Retired</Badge>}
          </Group>
          <Text c="dimmed">
            {categoryLabel(component.category)} · Acquired {component.acquired_on}
          </Text>
        </div>
        <Button variant="default" onClick={() => setEditOpened(true)}>
          Edit
        </Button>
      </Group>

      <ComponentOverview componentId={componentId} />

      <Group gap="xl">
        <div>
          <Text size="sm" c="dimmed">
            Total distance
          </Text>
          <Text fw={500}>{formatDistance(component.total_distance)}</Text>
        </div>
      </Group>

      <ComponentFormModal
        opened={editOpened}
        onClose={() => setEditOpened(false)}
        component={component}
      />
    </Stack>
  )
}
