import { modals } from '@mantine/modals'
import type {
  CategoryServiceRequirement,
  ComponentDetail,
  ComponentServiceRequirement,
} from '../../types/models'

// Shared by the component page's intervals section and the installation
// modal's older ServiceIntervalsSection (until part 3 removes it).

// The category templates this component doesn't have yet. "Already has" is
// keyed by category_service_requirement_id, not service type -- a template
// can have several satisfiers (CategoryServiceRequirementsController#apply
// checks the same way).
export function availableTemplatesFor(
  component: Pick<ComponentDetail, 'id' | 'category'>,
  templates: readonly CategoryServiceRequirement[] | undefined,
  componentRequirements: readonly ComponentServiceRequirement[] | undefined,
): CategoryServiceRequirement[] {
  const linked = new Set(
    (componentRequirements ?? [])
      .filter((r) => r.component_id === component.id && r.category_service_requirement_id !== null)
      .map((r) => r.category_service_requirement_id),
  )
  return (templates ?? []).filter((template) => template.category === component.category && !linked.has(template.id))
}

// Before logging a service type against one requirement, say which OTHER
// requirements of the component it also clears ("This also clears: ..."),
// or log straight away when there are none.
export function confirmLogService(
  component: Pick<ComponentDetail, 'service_requirements'>,
  requirementId: number,
  serviceTypeId: number,
  onLog: () => void,
) {
  const alsoClears = component.service_requirements
    .filter((r) => r.id !== requirementId && r.satisfiers.some((s) => s.service_type_id === serviceTypeId))
    .map((r) => r.requirement_name)

  if (alsoClears.length === 0) {
    onLog()
    return
  }

  modals.openConfirmModal({
    title: 'Log service',
    children: `This also clears: ${alsoClears.join(', ')}`,
    labels: { confirm: 'Log service', cancel: 'Cancel' },
    onConfirm: onLog,
  })
}
