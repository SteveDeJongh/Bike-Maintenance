import { useMemo, useState } from 'react'
import { Alert, Button, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useActivityFeed, useBikes, useComponents, useTableViewPreference } from '../api/queries'
import { useIsMobile } from '../hooks/useIsMobile'
import ServiceSessionViewModal from '../components/forms/ServiceSessionViewModal'
import { useActivityFilters } from '../components/activity/useActivityFilters'
import ActivityFilters from '../components/activity/ActivityFilters'
import ActivityTable from '../components/activity/ActivityTable'
import NarrowActivityCard from '../components/activity/NarrowActivityCard'
import EmptyState from '../components/activity/EmptyState'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import { formatElevation } from '../utils/elevation'
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
  const {
    kinds,
    toggleKind,
    bikeId,
    setBikeId,
    componentId,
    setComponentId,
    datePreset,
    setDatePreset,
    customRange,
    setCustomRange,
    qInput,
    setQInput,
    q,
    sortMetric,
    setSortMetric,
    rideOnly,
    order,
    handleOrderChange,
    orderedColumns,
    toggleColumn,
    reorderColumn,
    onHeaderDragEnd,
    saveError,
    clearSaveError,
    tz,
    from,
    to,
    clearFilters,
    hasActiveFilters,
  } = useActivityFilters(initialData)

  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<number>>(new Set())
  const [viewingSessionId, setViewingSessionId] = useState<number | null>(null)
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
    sort: sortMetric,
  })

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [ data ])
  const meta = data?.pages[data.pages.length - 1]?.meta
  const totalForLoadedKinds = meta ? kinds.reduce((sum, kind) => sum + meta.kind_counts[kind], 0) : 0

  return (
    <Stack>
      <div>
        <Title order={2}>Activity</Title>
        {meta && (
          <Text c="dimmed" size="sm">
            {meta.ride_totals.count} {meta.ride_totals.count === 1 ? 'ride' : 'rides'} ·{' '}
            {formatDistance(meta.ride_totals.distance_meters)} · {formatDuration(meta.ride_totals.moving_time)} ·{' '}
            {formatElevation(meta.ride_totals.total_elevation_gain)}
          </Text>
        )}
      </div>

      <ActivityFilters
        kinds={kinds}
        toggleKind={toggleKind}
        kindCounts={meta?.kind_counts}
        bikesList={bikesList}
        componentsList={componentsList}
        bikeId={bikeId}
        setBikeId={setBikeId}
        componentId={componentId}
        setComponentId={setComponentId}
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        customRange={customRange}
        setCustomRange={setCustomRange}
        qInput={qInput}
        setQInput={setQInput}
        hasActiveFilters={hasActiveFilters}
        clearFilters={clearFilters}
        order={order}
        handleOrderChange={handleOrderChange}
        rideOnly={rideOnly}
        sortMetric={sortMetric}
        setSortMetric={setSortMetric}
      />

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
        <EmptyState hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters} />
      )}

      {!isPending && items.length > 0 && isNarrow && (
        <Stack gap="xs">
          {items.map((item, index) => (
            <NarrowActivityCard
              key={`${item.kind}-${item.id}-${index}`}
              item={item}
              onViewSession={setViewingSessionId}
            />
          ))}
        </Stack>
      )}

      {!isPending && items.length > 0 && !isNarrow && (
        <ActivityTable
          orderedColumns={orderedColumns}
          toggleColumn={toggleColumn}
          reorderColumn={reorderColumn}
          onHeaderDragEnd={onHeaderDragEnd}
          items={items}
          expandedSessionIds={expandedSessionIds}
          onToggleSessionExpanded={toggleSessionExpanded}
          onViewSession={setViewingSessionId}
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
              Showing {items.length} of {totalForLoadedKinds}
            </Text>
          )}
        </>
      )}

      {viewingSessionId !== null && (
        <ServiceSessionViewModal opened onClose={() => setViewingSessionId(null)} sessionId={viewingSessionId} />
      )}
    </Stack>
  )
}
