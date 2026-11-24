import { Link } from 'react-router-dom'
import { Alert, Anchor, Group, Loader, Text } from '@mantine/core'
import { useComponent } from '../api/queries'
import { categoryLabel } from '../constants'
import ComponentSwapPill, { type SwapPillAssignment } from './ComponentSwapPill'
import type { ComponentAssignment } from '../types/models'

// The Bike page's AssignmentDetailModal's leading identity row: Category, Component
// (linked), and Status ("Uninstalled", plus "Last on <bike>" when it has
// been on one, or "Installed - " each current
// bike linked -- a component can be on more than one at once, see
// ComponentAssignment's documented indoor_only-on-two-bikes exception).
// swapAssignment (AssignmentDetailModal only, for a still-open
// installation) turns the Component field into ComponentSwapPill;
// onSwapped then reports the new assignment so the modal can follow the
// slot. Without them it's the plain link.
export default function ComponentIdentityStatus({
  componentId,
  swapAssignment,
  onSwapped,
}: {
  componentId: number
  swapAssignment?: SwapPillAssignment
  onSwapped?: (newAssignment: ComponentAssignment) => void
}) {
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
        {swapAssignment ? (
          <div>
            <ComponentSwapPill assignment={swapAssignment} onSwapped={onSwapped} />
          </div>
        ) : (
          <Anchor component={Link} to={`/components/${component.id}`} fw={500}>
            {component.label}
          </Anchor>
        )}
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Status
        </Text>
        {component.current_bikes.length === 0 ? (
          <Text fw={500}>
            Uninstalled
            {component.last_bike && (
              <Text span c="dimmed" fw={400}>
                {' · Last on '}
                <Anchor component={Link} to={`/bikes/${component.last_bike.id}`}>
                  {component.last_bike.name}
                </Anchor>
              </Text>
            )}
          </Text>
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
    </Group>
  )
}
