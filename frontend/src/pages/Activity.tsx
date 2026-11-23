import { useMemo, useState } from 'react'
import { Alert, Button, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useActivityFeed, useBikes, useComponents, useTableViewPreference } from '../api/queries'
import { useIsMobile } from '../hooks/useIsMobile'
import ServiceSessionViewModal from '../components/forms/ServiceSessionViewModal'
import RideDetailModal from '../components/ride/RideDetailModal'
import { useActivityFilters } from '../components/activity/useActivityFilters'
import ActivityToolbar from '../components/activity/ActivityToolbar'
import ActivitySummaryTiles from '../components/activity/ActivitySummaryTiles'
import ActivityViewSheet from '../components/activity/ActivityViewSheet'
import { ACTIVITY_FIELD_LABELS, type ActivityField } from '../components/activity/activityFields'
import ActivityTable from '../components/activity/ActivityTable'
import NarrowActivityCard from '../components/activity/NarrowActivityCard'
import EmptyState from '../components/activity/EmptyState'
import type { TableViewPreferenceData } from '../types/models'

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

  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<number>>(new Set())
  const [viewingSessionId, setViewingSessionId] = useState<number | null>(null)
  const [viewingRideId, setViewingRideId] = useState<number | null>(null)
  const [viewSheetOpened, setViewSheetOpened] = useState(false)
  const isNarrow = useIsMobile()

  function toggleSessionExpanded(sessionId: number) {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
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
        <EmptyState hasActiveFilters={filters.hasActiveFilters} onClearFilters={filters.clearFilters} />
      )}

      {!isPending && items.length > 0 && isNarrow && (
        <Stack gap="xs">
          {items.map((item, index) => (
            <NarrowActivityCard
              key={`${item.kind}-${item.id}-${index}`}
              item={item}
              onViewSession={setViewingSessionId}
              onOpenRide={setViewingRideId}
            />
          ))}
        </Stack>
      )}

      {!isPending && items.length > 0 && !isNarrow && (
        <ActivityTable
          orderedColumns={fields}
          toggleColumn={(column) => filters.toggleField(column as ActivityField)}
          reorderColumn={(a, b) => filters.reorderColumn(a as ActivityField, b as ActivityField)}
          onHeaderDragEnd={() => {}}
          items={items}
          expandedSessionIds={expandedSessionIds}
          onToggleSessionExpanded={toggleSessionExpanded}
          onViewSession={setViewingSessionId}
          onOpenRide={setViewingRideId}
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

      {viewingSessionId !== null && (
        <ServiceSessionViewModal opened onClose={() => setViewingSessionId(null)} sessionId={viewingSessionId} />
      )}
      <RideDetailModal opened={viewingRideId !== null} onClose={() => setViewingRideId(null)} rideId={viewingRideId} />
      <ActivityViewSheet opened={viewSheetOpened} onClose={() => setViewSheetOpened(false)} filters={filters} />
    </Stack>
  )
}
