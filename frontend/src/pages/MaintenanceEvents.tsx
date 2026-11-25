import { useMemo, useState } from 'react'
import { Alert, Button, Group, Loader, Menu, Stack, Text, Title } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import { useBikes, useComponents, useMaintenanceLog, useServiceTypes, useTableViewPreference } from '../api/queries'
import BatchServiceModal from '../components/forms/BatchServiceModal'
import MaintenanceEventFormModal from '../components/forms/MaintenanceEventFormModal'
import MaintenanceLogTiles from '../components/maintenanceLog/MaintenanceLogTiles'
import MaintenanceLogToolbar from '../components/maintenanceLog/MaintenanceLogToolbar'
import MaintenanceLogViewSheet from '../components/maintenanceLog/MaintenanceLogViewSheet'
import { defaultSessionBike, maintenanceTiles, servicesThisYearLine } from '../components/maintenanceLog/maintenanceLogModel'
import { useMaintenanceLogView } from '../components/maintenanceLog/useMaintenanceLogView'
import { componentTileCounts } from '../components/componentList/componentListModel'
import { categoryLabel } from '../constants'
import { formatShortDate } from '../utils/datetime'
import { MOBILE_TAP_TARGET_STYLE } from '../utils/touchTarget'
import type { MaintenanceEvent, TableViewPreferenceData } from '../types/models'

// The Maintenance page (route /maintenance-events): every service logged,
// in service sessions or one at a time. Gated on the maintenance_events
// preference, which seeds the view state once, on mount.
export default function MaintenanceEvents() {
  const { data: preferenceData, isPending } = useTableViewPreference('maintenance_events')
  if (isPending || !preferenceData) return <Loader />
  return <MaintenanceInner initialData={preferenceData.data} />
}

function MaintenanceInner({ initialData }: { initialData: TableViewPreferenceData }) {
  const view = useMaintenanceLogView(initialData)
  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useMaintenanceLog(view.params)
  const { data: bikes } = useBikes()
  const { data: components } = useComponents()
  const { data: serviceTypes } = useServiceTypes()

  const [logOpened, setLogOpened] = useState(false)
  const [sessionOpened, setSessionOpened] = useState(false)
  const [editing, setEditing] = useState<MaintenanceEvent | null>(null)
  const [viewSheetOpened, setViewSheetOpened] = useState(false)

  const meta = data?.pages[data.pages.length - 1]?.meta
  const events = useMemo(() => data?.pages.flatMap((page) => page.events) ?? [], [data])
  const sessionBike = defaultSessionBike(bikes)
  const tiles = maintenanceTiles(meta?.tiles, components ? componentTileCounts(components) : undefined)
  const categories = useMemo(
    () => [...new Set((components ?? []).map((component) => component.category))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
    [components],
  )

  return (
    <Stack>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>Maintenance</Title>
          <Text c="dimmed" size="sm" visibleFrom="sm">
            Every service you've logged, in sessions or one at a time
          </Text>
          <Text c="dimmed" size="sm" hiddenFrom="sm">
            {servicesThisYearLine(meta?.tiles.services_this_year)}
          </Text>
        </div>

        <Group gap="sm" visibleFrom="sm" wrap="nowrap">
          <Button variant="outline" onClick={() => setLogOpened(true)}>
            Log service
          </Button>
          <Button onClick={() => setSessionOpened(true)} disabled={!sessionBike}>
            Log service session
          </Button>
        </Group>

        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <Button hiddenFrom="sm" rightSection={<IconChevronDown size={14} />} style={MOBILE_TAP_TARGET_STYLE}>
              Log service
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setLogOpened(true)} style={MOBILE_TAP_TARGET_STYLE}>
              One component
            </Menu.Item>
            <Menu.Item onClick={() => setSessionOpened(true)} disabled={!sessionBike} style={MOBILE_TAP_TARGET_STYLE}>
              Service session on a bike
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <MaintenanceLogTiles tiles={tiles} />

      <MaintenanceLogToolbar
        view={view}
        kindCounts={meta?.kind_counts}
        bikes={bikes}
        categories={categories}
        serviceTypes={serviceTypes}
        onOpenView={() => setViewSheetOpened(true)}
      />

      {view.saveError && (
        <Alert color="red" withCloseButton onClose={view.clearSaveError}>
          {view.saveError}
        </Alert>
      )}

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load services">
          {error.message}
        </Alert>
      )}

      {/* Interim list -- replaced by the DataList in the next increment. */}
      {events.map((event) => (
        <Text key={event.id} size="sm" style={{ cursor: 'pointer' }} onClick={() => setEditing(event)}>
          {formatShortDate(event.performed_at)} · {event.service_type.name} · {event.component.label}
        </Text>
      ))}

      {!isPending && events.length > 0 && (
        <>
          <Group justify="center">
            {hasNextPage && (
              <Button variant="default" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                Load more
              </Button>
            )}
          </Group>
          {meta && (
            <Text size="sm" c="dimmed" ta="center">
              Showing {events.length} of {meta.total}
            </Text>
          )}
        </>
      )}

      <MaintenanceEventFormModal opened={logOpened} onClose={() => setLogOpened(false)} />
      <MaintenanceEventFormModal opened={editing != null} onClose={() => setEditing(null)} event={editing ?? undefined} />
      {sessionBike && (
        <BatchServiceModal opened={sessionOpened} onClose={() => setSessionOpened(false)} bikeId={sessionBike.id} />
      )}
      <MaintenanceLogViewSheet
        opened={viewSheetOpened}
        onClose={() => setViewSheetOpened(false)}
        view={view}
        kindCounts={meta?.kind_counts}
      />
    </Stack>
  )
}
