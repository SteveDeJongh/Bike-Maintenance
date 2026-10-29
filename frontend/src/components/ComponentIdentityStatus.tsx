import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Anchor, Group, Loader, Text } from '@mantine/core'
import { useComponent } from '../api/queries'
import { categoryLabel } from '../constants'

// Shared by the standalone ComponentDetail page and the Bike page's
// AssignmentDetailModal -- the leading identity row: Category, Component
// (linked), and Status ("Uninstalled", or "Installed - " each current
// bike linked -- a component can be on more than one at once, see
// ComponentAssignment's documented indoor_only-on-two-bikes exception).
// `extra` lets a caller fold its own fields into the same Group (e.g. the
// component page's own "Total distance" stat) rather than duplicating the
// Group wrapper.
export default function ComponentIdentityStatus({ componentId, extra }: { componentId: number; extra?: ReactNode }) {
  const { data: component, isPending, error } = useComponent(componentId)

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
    <Group gap="xl">
      <div>
        <Text size="sm" c="dimmed">
          Category
        </Text>
        <Text fw={500}>{categoryLabel(component.category)}</Text>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Component
        </Text>
        <Anchor component={Link} to={`/components/${component.id}`} fw={500}>
          {component.label}
        </Anchor>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Status
        </Text>
        {component.current_bikes.length === 0 ? (
          <Text fw={500}>Uninstalled</Text>
        ) : (
          <Text fw={500}>
            Installed -{' '}
            {component.current_bikes.map((bike, index) => (
              <span key={bike.id}>
                {index > 0 && ', '}
                <Anchor component={Link} to={`/bikes/${bike.id}`}>
                  {bike.name}
                </Anchor>
              </span>
            ))}
          </Text>
        )}
      </div>
      {extra}
    </Group>
  )
}
