import { useMemo } from 'react'
import { useActivityFeed } from '../../api/queries'
import PageSection from '../PageSection'
import BikeServiceCard from './BikeServiceCard'
import ComponentHistoryCard from './ComponentHistoryCard'
import { BIKE_SECTION_STORAGE_KEYS, bikeServiceFeedParams, serviceHistoryFoldedSummary } from './bikeSectionsModel'
import { historyRows } from './historyRows'
import type { BikeDetail, ComponentAssignmentWithStats } from '../../types/models'

// Service and Component history side by side (each card unchanged; they
// wrap to one column when narrow), under one PageSection header. Folded,
// the summary counts what's hidden: services from the service feed's
// kind_counts -- the same query, and so the same single request, as
// BikeServiceCard's -- and component changes from the history rows.
export default function BikeServiceHistorySection({
  bike,
  onOpenAssignment,
}: {
  bike: BikeDetail
  onOpenAssignment: (assignment: ComponentAssignmentWithStats) => void
}) {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const serviceFeed = useActivityFeed(bikeServiceFeedParams(bike.id, tz))
  const services = serviceFeed.data?.pages[0]?.meta.kind_counts.service ?? null
  const changes = useMemo(() => historyRows(bike.component_assignments).length, [bike.component_assignments])

  return (
    <PageSection
      id="service-history"
      title="Service & component history"
      summary="Latest 5 of each"
      foldedSummary={serviceHistoryFoldedSummary({ services, changes })}
      storageKey={BIKE_SECTION_STORAGE_KEYS.serviceHistory}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)', alignItems: 'flex-start' }}>
        <BikeServiceCard bikeId={bike.id} />
        <ComponentHistoryCard assignments={bike.component_assignments} onOpen={onOpenAssignment} />
      </div>
    </PageSection>
  )
}
