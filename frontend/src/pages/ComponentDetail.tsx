import { useParams, Link } from 'react-router-dom'
import { Alert, Anchor, Loader, Stack, Text } from '@mantine/core'
import { ApiError } from '../api/client'
import { useComponent } from '../api/queries'
import ComponentPageHeader from '../components/component/ComponentPageHeader'
import ComponentStatTiles from '../components/component/ComponentStatTiles'
import ComponentServiceAndHistory from '../components/ComponentServiceAndHistory'
import MaintenanceAlertBanners from '../components/MaintenanceAlertBanners'

// The component page (docs/frontend-ui.md, "Component page"): the one place
// for a part's whole life -- header and actions, alert banners, lifetime
// tiles, then its service intervals, maintenance and installations.
export default function ComponentDetail() {
  const { id } = useParams<{ id: string }>()
  const componentId = Number(id)

  const { data: component, isPending, error } = useComponent(componentId)

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

  return (
    <Stack>
      <ComponentPageHeader component={component} />
      <MaintenanceAlertBanners scope={{ componentId }} />
      <ComponentStatTiles component={component} />
      <ComponentServiceAndHistory componentId={componentId} />
    </Stack>
  )
}
