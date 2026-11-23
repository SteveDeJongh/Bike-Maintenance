import { useMemo, useState } from 'react'
import { Alert, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { useActivityFeed, useBikes, useComponents, useTableViewPreference } from '../api/queries'
import ServiceSessionViewModal from '../components/forms/ServiceSessionViewModal'
import RideDetailModal from '../components/ride/RideDetailModal'
import { useActivityFilters } from '../components/activity/useActivityFilters'
import ActivityToolbar from '../components/activity/ActivityToolbar'
import ActivitySummaryTiles from '../components/activity/ActivitySummaryTiles'
import ActivityViewSheet from '../components/activity/ActivityViewSheet'
import { ACTIVITY_FIELD_LABELS } from '../components/activity/activityFields'
import ActivityList from '../components/activity/ActivityList'
import AssignmentDetailModal from '../components/forms/AssignmentDetailModal'
import EmptyState from '../components/activity/EmptyState'
import type { ActivityItem, TableViewPreferenceData } from '../types/models'

type OpenedItem =
  | { kind: 'ride'; id: number }
  | { kind: 'session'; id: number }
  | { kind: 'assignment'; id: number; bikeId: number; componentId: number }

// Gates the whole page on activity_log's TableViewPreference resolving
// first, same two-component wrapper/Inner split as every other adopter of
// this system -- useTableViewPreferences' useState initializers only seed
// from it once, on mount.
export default function Activity() {
  const { data: preferenceData, isPending } = useTableViewPreference('activity_log')

  if (isPending || !preferenceData) return <Loader />

  return <ActivityInner initialData={preferenceData.data} />
}

function ActivityInner({ initialData }: { initialData: TableViewPreferenceData }) {
  const filters = useActivityFilters(initialData)
  const { kinds, bikeId, componentId, tz, from, to, q, order, apiSort, fields, saveError, clearSaveError } = filters

  // What a clicked row opened -- each kind has its own modal (a
  // session-less maintenance event navigates to its component instead).
  const [opened, setOpened] = useState<OpenedItem | null>(null)
  const [viewSheetOpened, setViewSheetOpened] = useState(false)
  const navigate = useNavigate()

  function openItem(item: ActivityItem) {
    switch (item.kind) {
      case 'ride':
        setOpened({ kind: 'ride', id: item.id })
        break
      case 'service_session':
        setOpened({ kind: 'session', id: item.id })
        break
      case 'maintenance_event':
        navigate(`/components/${item.component_id}?event=${item.id}`)
        break
      case 'setup_change':
        if (item.bike) setOpened({ kind: 'assignment', id: item.id, bikeId: item.bike.id, componentId: item.component.id })
        else navigate(`/components/${item.component.id}`)
        break
    }
  }

  const { data: bikesList } = useBikes()
  const { data: componentsList } = useComponents()

  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivityFeed({
    kinds,
    bikeId,
    from,
    to,
    tz,
    q: q || undefined,
    componentId,
    order,
    sort: apiSort,
  })

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const lastPage = data?.pages[data.pages.length - 1]
  const meta = lastPage?.meta
  const ridesOnly = lastPage?.rides_only ?? false
  const total = meta ? (ridesOnly ? meta.kind_counts.ride : kinds.reduce((sum, kind) => sum + meta.kind_counts[kind], 0)) : 0

  return (
    <Stack>
      <div>
        <Title order={2}>Activity</Title>
        <Text c="dimmed" size="sm">
          Rides, service and setup changes in one list
        </Text>
      </div>

      <ActivitySummaryTiles meta={meta} />

      <ActivityToolbar
        filters={filters}
        kindCounts={meta?.kind_counts}
        bikesList={bikesList}
        componentsList={componentsList}
        onOpenView={() => setViewSheetOpened(true)}
      />

      {ridesOnly && filters.sortColumn !== 'occurred_at' && (
        <Text size="xs" c="dimmed">
          Sorted by {ACTIVITY_FIELD_LABELS[filters.sortColumn]}: showing rides only
        </Text>
      )}

      {saveError && (
        <Alert color="red" withCloseButton onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load activity">
          {error.message}
        </Alert>
      )}

      {!isPending && !isError && items.length === 0 && (
        <Paper withBorder radius="md" p="lg">
          <EmptyState hasActiveFilters={filters.hasActiveFilters} onClearFilters={filters.clearFilters} />
        </Paper>
      )}

      {!isPending && items.length > 0 && (
        <ActivityList
          pages={data?.pages ?? []}
          groupBy={filters.listGroupBy}
          fields={fields}
          sortColumn={filters.sortColumn}
          order={order}
          onSort={filters.onHeaderSort}
          onOpen={openItem}
        />
      )}

      {!isPending && items.length > 0 && (
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
              Showing {items.length} of {total}
            </Text>
          )}
        </>
      )}

      <RideDetailModal opened={opened?.kind === 'ride'} onClose={() => setOpened(null)} rideId={opened?.kind === 'ride' ? opened.id : null} />
      {opened?.kind === 'session' && (
        <ServiceSessionViewModal opened onClose={() => setOpened(null)} sessionId={opened.id} />
      )}
      {opened?.kind === 'assignment' && (
        <AssignmentDetailModal
          opened
          onClose={() => setOpened(null)}
          bikeId={opened.bikeId}
          assignmentId={opened.id}
          fallbackComponentId={opened.componentId}
        />
      )}
      <ActivityViewSheet opened={viewSheetOpened} onClose={() => setViewSheetOpened(false)} filters={filters} />
    </Stack>
  )
}
