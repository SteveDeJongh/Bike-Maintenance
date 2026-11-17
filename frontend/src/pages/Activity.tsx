import { useMemo, useState } from 'react'
import { Alert, Anchor, Button, Card, Group, Loader, Stack, Text, Title, Tooltip } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useActivityFeed, useBikes, useComponents, useTableViewPreference } from '../api/queries'
import { useIsMobile } from '../hooks/useIsMobile'
import ViewOnStravaLink from '../components/ride/ViewOnStravaLink'
import BatchServiceModal from '../components/forms/BatchServiceModal'
import ServiceSessionViewModal from '../components/forms/ServiceSessionViewModal'
import { useActivityFilters } from '../components/activity/useActivityFilters'
import ActivityFilters from '../components/activity/ActivityFilters'
import ActivityTable, { RideRowActions } from '../components/activity/ActivityTable'
import { activityItemIconMeta, initialPerformedAtForRide, nonRideNote } from '../components/activity/activityItemMeta'
import { formatDateTime } from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import { formatElevation } from '../utils/elevation'
import type { ActivityItem, ActivityRideItem, TableViewPreferenceData } from '../types/models'

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
  const [batchServiceRide, setBatchServiceRide] = useState<ActivityRideItem | null>(null)
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
              onLogService={setBatchServiceRide}
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
          onLogService={setBatchServiceRide}
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

      {batchServiceRide?.bike && (
        <BatchServiceModal
          opened
          onClose={() => setBatchServiceRide(null)}
          bikeId={batchServiceRide.bike.id}
          initialPerformedAt={initialPerformedAtForRide(batchServiceRide)}
        />
      )}

      {viewingSessionId !== null && (
        <ServiceSessionViewModal opened onClose={() => setViewingSessionId(null)} sessionId={viewingSessionId} />
      )}
    </Stack>
  )
}

// Narrow-screen alternative to the table: ride rows become a compact card
// (date/name/bike/distance/moving time); non-ride rows stay single lines,
// since they're already compact -- same split the plan calls for.
function NarrowActivityCard({
  item,
  onViewSession,
  onLogService,
}: {
  item: ActivityItem
  onViewSession: (sessionId: number) => void
  onLogService: (ride: ActivityRideItem) => void
}) {
  const { Icon, label } = activityItemIconMeta(item)

  if (item.kind === 'ride') {
    return (
      <Card withBorder padding="sm">
        <Group justify="space-between" wrap="nowrap" mb={4}>
          <Group gap={6} wrap="nowrap">
            <Tooltip label={label}>
              <Icon size={14} />
            </Tooltip>
            <Text size="xs" c="dimmed">
              {formatDateTime(item.occurred_at)}
            </Text>
          </Group>
          <RideRowActions ride={item} onLogService={onLogService} />
        </Group>
        <ViewOnStravaLink stravaId={item.strava_id} name={item.name} />
        <Group gap="xs" mt={4}>
          <Text size="sm">{item.bike ? item.bike.name : 'No bike'}</Text>
          <Text size="sm" c="dimmed">
            {formatDistance(item.distance_meters)}
          </Text>
          {item.moving_time != null && (
            <Text size="sm" c="dimmed">
              {formatDuration(item.moving_time)}
            </Text>
          )}
        </Group>
      </Card>
    )
  }

  const note = nonRideNote(item)

  return (
    <Card withBorder padding="sm" bg="var(--mantine-color-gray-light)">
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={label}>
          <Icon size={14} />
        </Tooltip>
        <Text size="xs" c="dimmed">
          {formatDateTime(item.occurred_at)}
        </Text>
        {item.kind === 'service_session' ? (
          <Anchor component="button" type="button" onClick={() => onViewSession(item.id)} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        ) : item.kind === 'maintenance_event' ? (
          <Anchor component={Link} to={`/components/${item.component_id}?event=${item.id}`} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        ) : (
          <Anchor component={Link} to={`/components/${item.component.id}`} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        )}
      </Group>
      {note && (
        <Text size="xs" c="dimmed" mt={2}>
          {note}
        </Text>
      )}
    </Card>
  )
}

function EmptyState({ hasActiveFilters, onClearFilters }: { hasActiveFilters: boolean; onClearFilters: () => void }) {
  if (hasActiveFilters) {
    return (
      <Group gap="xs">
        <Text c="dimmed">Nothing matches these filters.</Text>
        <Anchor component="button" type="button" size="sm" onClick={onClearFilters}>
          Clear filters
        </Anchor>
      </Group>
    )
  }

  return (
    <Text c="dimmed">
      No activity yet.{' '}
      <Anchor component={Link} to="/strava">
        Connect or sync Strava
      </Anchor>{' '}
      to pull in your rides.
    </Text>
  )
}
