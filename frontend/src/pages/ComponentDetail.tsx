import { useEffect, useState } from 'react'
import { useLocation, useParams, Link } from 'react-router-dom'
import { Alert, Anchor, Box, Group, Loader, Stack, Text } from '@mantine/core'
import { ApiError } from '../api/client'
import { useComponent } from '../api/queries'
import ComponentIntervalsSection from '../components/component/ComponentIntervalsSection'
import ComponentPageHeader from '../components/component/ComponentPageHeader'
import ComponentStatTiles from '../components/component/ComponentStatTiles'
import InstallationHistorySection from '../components/component/InstallationHistorySection'
import MaintenanceHistorySection from '../components/component/MaintenanceHistorySection'
import MaintenanceAlertBanners from '../components/MaintenanceAlertBanners'
import InstallOnBikeModal from '../components/installOnBike/InstallOnBikeModal'
import { installationRowId } from '../components/component/componentPageModel'

// The component page (docs/frontend-ui.md, "Component page"): the one place
// for a part's whole life -- header and actions, alert banners, lifetime
// tiles, then its service intervals, maintenance and installations.
export default function ComponentDetail() {
  const { id } = useParams<{ id: string }>()
  const componentId = Number(id)

  const { data: component, isPending, error } = useComponent(componentId)
  // #intervals (the installation modal's "No service intervals" link)
  // scrolls to the Service intervals section once the page has loaded.
  const { hash } = useLocation()
  const toIntervals = hash === '#intervals'
  useEffect(() => {
    if (toIntervals && component) document.getElementById('intervals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [toIntervals, component])

  // Install on bike, from the ⋯ menu or Installation history's "+ Add
  // installation"; the new row is scrolled to and highlighted briefly once
  // the refetched history has it.
  const [installOrigin, setInstallOrigin] = useState<'menu' | 'history' | null>(null)
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const highlightedPresent = component?.assignments.some((installation) => installation.id === highlightedId) ?? false
  useEffect(() => {
    if (highlightedId == null || !highlightedPresent) return
    document.getElementById(installationRowId(highlightedId))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = window.setTimeout(() => setHighlightedId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightedId, highlightedPresent])

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
      <ComponentPageHeader
        component={component}
        onInstallOnBike={component.retired_on ? undefined : () => setInstallOrigin('menu')}
      />
      <MaintenanceAlertBanners scope={{ componentId }} />
      <ComponentStatTiles component={component} />
      <Box id="intervals" style={{ scrollMarginTop: 'calc(var(--app-shell-header-height, 0px) + var(--mantine-spacing-md))' }}>
        <ComponentIntervalsSection component={component} openOnMount={toIntervals} />
      </Box>
      <Group align="flex-start" gap="lg" wrap="wrap">
        <Box style={{ flex: '1 1 520px', minWidth: 0 }}>
          <MaintenanceHistorySection componentId={componentId} events={component.maintenance_events} />
        </Box>
        <Box style={{ flex: '1 1 440px', minWidth: 0 }}>
          <InstallationHistorySection
            installations={component.assignments}
            highlightedId={highlightedId}
            onAddInstallation={component.retired_on ? undefined : () => setInstallOrigin('history')}
          />
        </Box>
      </Group>
      {!component.retired_on && (
        <InstallOnBikeModal
          opened={installOrigin != null}
          onClose={() => setInstallOrigin(null)}
          component={component}
          origin={installOrigin ?? 'menu'}
          onInstalled={setHighlightedId}
        />
      )}
    </Stack>
  )
}
