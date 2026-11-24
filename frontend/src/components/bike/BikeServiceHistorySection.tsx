import PageSection from '../PageSection'
import BikeServiceCard from './BikeServiceCard'
import ComponentHistoryCard from './ComponentHistoryCard'
import type { BikeDetail, ComponentAssignmentWithStats } from '../../types/models'

// Service and Component history side by side (each card unchanged; they
// wrap to one column when narrow), under one PageSection header.
export default function BikeServiceHistorySection({
  bike,
  onOpenAssignment,
}: {
  bike: BikeDetail
  onOpenAssignment: (assignment: ComponentAssignmentWithStats) => void
}) {
  return (
    <PageSection id="service-history" title="Service & component history" summary="Latest 5 of each">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)', alignItems: 'flex-start' }}>
        <BikeServiceCard bikeId={bike.id} />
        <ComponentHistoryCard assignments={bike.component_assignments} onOpen={onOpenAssignment} />
      </div>
    </PageSection>
  )
}
