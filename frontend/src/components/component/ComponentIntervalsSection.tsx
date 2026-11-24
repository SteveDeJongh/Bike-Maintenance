import { useState, type CSSProperties } from 'react'
import { ActionIcon, Badge, Box, Button, Group, Menu, Paper, Stack, Text } from '@mantine/core'
import { IconDots, IconPencil } from '@tabler/icons-react'
import {
  useAllComponentServiceRequirements,
  useCategoryServiceRequirements,
  useComponentCategorySettings,
  useNotificationSetting,
} from '../../api/queries'
import {
  useDeleteComponentServiceRequirement,
  useDismissServiceAlert,
  useSaveComponentCategorySettings,
  useUpdateComponentServiceRequirement,
} from '../../api/mutations'
import { formatApiError } from '../../api/errors'
import PageSection from '../PageSection'
import { confirmDelete } from '../confirmDelete'
import WearBar from '../dashboard/WearBar'
import AddCustomServiceIntervalModal from '../forms/AddCustomServiceIntervalModal'
import EditServiceIntervalModal from '../forms/EditServiceIntervalModal'
import MaintenanceEventFormModal from '../forms/MaintenanceEventFormModal'
import AddFromCategoryDefaults from '../serviceIntervals/AddFromCategoryDefaults'
import CustomRequirementEditor from '../serviceIntervals/CustomRequirementEditor'
import { availableTemplatesFor, confirmLogService } from '../serviceIntervals/serviceIntervalsShared'
import { categoryLabel, SERVICE_STATUS_COLORS } from '../../constants'
import { formatDrivingRemaining } from '../../utils/serviceInterval'
import {
  intervalsSummary,
  lastDoneText,
  orderRequirements,
  requirementFraction,
  requirementProgressText,
  requirementRuleText,
} from './componentPageModel'
import { COMPONENT_SECTION_STORAGE_KEYS } from './componentSections'
import type { CategoryServiceRequirement, ComponentDetail, ComponentServiceRequirementWithStatus, ServiceStatus } from '../../types/models'

const STATUS_LABELS: Record<ServiceStatus, string> = { due: 'Due', warning: 'Soon', ok: 'OK' }

// Name and rule | wear bar and progress | what's left | last done | edit, ⋯.
// A phone stacks the middle columns under the name (index.css's
// .interval-row).
const ROW_TEMPLATE = 'minmax(200px, 1.6fr) minmax(150px, 1fr) minmax(90px, auto) minmax(100px, auto) auto'

// The component page's "Service intervals" (a PageSection): one grid row per
// requirement, enabled first and disabled ones muted. Each row's ⋯ menu
// holds the per-interval actions; the header's pills add from the
// category's defaults or a custom interval.
// `openOnMount`: the page was opened at #intervals (the installation
// modal's "No service intervals" link), so a folded section unfolds.
export default function ComponentIntervalsSection({
  component,
  openOnMount = false,
}: {
  component: ComponentDetail
  openOnMount?: boolean
}) {
  const { data: categoryTemplates } = useCategoryServiceRequirements()
  const { data: allComponentRequirements } = useAllComponentServiceRequirements()
  const [customOpened, setCustomOpened] = useState(false)
  const [addDefaultsOpened, setAddDefaultsOpened] = useState(false)
  const [logTarget, setLogTarget] = useState<number | null>(null)

  const availableTemplates = availableTemplatesFor(component, categoryTemplates, allComponentRequirements)
  const requirements = orderRequirements(component.service_requirements)

  const addButtons = (
    <Group gap="xs" wrap="wrap">
      <Button
        size="xs"
        radius="xl"
        variant="default"
        onClick={() => setAddDefaultsOpened((open) => !open)}
        disabled={availableTemplates.length === 0}
      >
        + Add from category defaults
      </Button>
      <Button size="xs" radius="xl" variant="default" onClick={() => setCustomOpened(true)}>
        + Custom interval
      </Button>
    </Group>
  )

  return (
    <PageSection
      id="component-intervals"
      title="Service intervals"
      summary={intervalsSummary(component.service_requirements)}
      foldedSummary={intervalsSummary(component.service_requirements)}
      actions={addButtons}
      storageKey={COMPONENT_SECTION_STORAGE_KEYS.intervals}
      openOnMount={openOnMount}
    >
      <Stack gap="sm">
        {addDefaultsOpened && (
          <AddFromCategoryDefaults
            componentId={component.id}
            templates={availableTemplates}
            onDone={() => setAddDefaultsOpened(false)}
          />
        )}

        {requirements.length === 0 ? (
          <Paper withBorder radius="md" p="xl">
            <Stack align="center" gap="sm">
              <Text fw={500}>No service intervals yet</Text>
              {addButtons}
            </Stack>
          </Paper>
        ) : (
          <Paper withBorder radius="md">
            {requirements.map((requirement, index) => (
              <IntervalRow
                key={requirement.id}
                requirement={requirement}
                component={component}
                template={categoryTemplates?.find((t) => t.id === requirement.category_service_requirement_id)}
                first={index === 0}
                onLog={(serviceTypeId) =>
                  confirmLogService(component, requirement.id, serviceTypeId, () => setLogTarget(serviceTypeId))
                }
              />
            ))}
          </Paper>
        )}
      </Stack>

      <AddCustomServiceIntervalModal
        opened={customOpened}
        onClose={() => setCustomOpened(false)}
        componentId={component.id}
        category={component.category}
      />
      <MaintenanceEventFormModal
        opened={logTarget !== null}
        onClose={() => setLogTarget(null)}
        defaultComponentId={component.id}
        defaultServiceTypeId={logTarget ?? undefined}
      />
    </PageSection>
  )
}

// This category's effective notifications: its own override, else the
// global setting, else on (NotificationSetting.effective_for's order).
function useCategoryNotifications(category: string) {
  const { data: settings } = useComponentCategorySettings()
  const { data: global } = useNotificationSetting()
  const override = settings?.find((setting) => setting.category === category)?.notifications_enabled
  return override ?? global?.notifications_enabled ?? true
}

function IntervalRow({
  requirement,
  component,
  template,
  first,
  onLog,
}: {
  requirement: ComponentServiceRequirementWithStatus
  component: ComponentDetail
  template: CategoryServiceRequirement | undefined
  first: boolean
  onLog: (serviceTypeId: number) => void
}) {
  const updateRequirement = useUpdateComponentServiceRequirement(requirement.id)
  const deleteRequirement = useDeleteComponentServiceRequirement()
  const dismiss = useDismissServiceAlert()
  const saveCategorySettings = useSaveComponentCategorySettings()
  const notificationsOn = useCategoryNotifications(component.category)
  const [editOpened, setEditOpened] = useState(false)
  const [editingCustom, setEditingCustom] = useState(false)

  const isLinked = requirement.category_service_requirement_id !== null
  const muted = !requirement.enabled
  const statusColor = SERVICE_STATUS_COLORS[requirement.status]
  const satisfiers = [...requirement.satisfiers].sort((a, b) => a.position - b.position)

  function handleEdit() {
    if (isLinked) setEditOpened(true)
    else setEditingCustom((open) => !open)
  }

  function handleRemove() {
    confirmDelete({
      title: 'Remove service interval',
      message: isLinked
        ? `Remove the ${requirement.requirement_name} interval from this component? You can add it back later from category defaults.`
        : `Remove the ${requirement.requirement_name} interval from this component? This cannot be undone.`,
      onConfirm: () => deleteRequirement.mutate(requirement.id),
    })
  }

  function toggleNotifications() {
    saveCategorySettings.mutate([{ category: component.category, changes: { notifications_enabled: !notificationsOn } }])
  }

  return (
    <Box
      className="interval-row"
      style={{
        '--interval-template': ROW_TEMPLATE,
        borderTop: first ? undefined : '1px solid var(--mantine-color-default-border)',
        opacity: muted ? 0.6 : undefined,
      } as CSSProperties}
    >
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Group gap={6} wrap="wrap">
          <Text size="sm" fw={600}>
            {requirement.requirement_name}
          </Text>
          {muted ? (
            <Badge size="xs" color="gray" variant="light">
              Off
            </Badge>
          ) : (
            <Badge size="xs" color={statusColor} variant="light">
              {STATUS_LABELS[requirement.status]}
            </Badge>
          )}
          {!isLinked && (
            <Badge size="xs" color="gray" variant="outline">
              Custom
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {requirementRuleText(requirement)}
        </Text>
      </Stack>

      <Stack gap={4} style={{ minWidth: 0 }}>
        <WearBar fraction={requirementFraction(requirement)} status={requirement.status} />
        <Text size="xs" c="dimmed" truncate>
          {requirementProgressText(requirement)}
        </Text>
      </Stack>

      <Text size="sm" fw={500} c={requirement.status === 'ok' ? 'dimmed' : statusColor} className="interval-row__end">
        {formatDrivingRemaining(requirement)}
      </Text>

      <Text size="xs" c="dimmed" className="interval-row__end">
        {lastDoneText(requirement)}
      </Text>

      <Group gap={4} wrap="nowrap" justify="flex-end">
        <ActionIcon variant="subtle" color="gray" aria-label={`Edit ${requirement.requirement_name}`} onClick={handleEdit}>
          <IconPencil size={16} />
        </ActionIcon>
        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${requirement.requirement_name}`}>
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {satisfiers.map((satisfier) => (
              <Menu.Item key={satisfier.id} onClick={() => onLog(satisfier.service_type_id)}>
                Log {satisfier.service_type_name}
              </Menu.Item>
            ))}
            {satisfiers.length > 0 && <Menu.Divider />}
            <Menu.Item onClick={() => updateRequirement.mutate({ enabled: !requirement.enabled })}>
              {requirement.enabled ? 'Disable' : 'Enable'}
            </Menu.Item>
            <Menu.Item onClick={toggleNotifications}>
              {notificationsOn ? 'Turn off' : 'Turn on'} notifications for {categoryLabel(component.category)}
            </Menu.Item>
            {requirement.enabled && requirement.status !== 'ok' && (
              <Menu.Item onClick={() => dismiss.mutate(requirement.id)}>Dismiss until next sync</Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item color="red" onClick={handleRemove}>
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {updateRequirement.isError && (
        <Text c="red" size="xs" style={{ gridColumn: '1 / -1' }}>
          {formatApiError(updateRequirement.error)}
        </Text>
      )}

      {!isLinked && editingCustom && (
        <Box style={{ gridColumn: '1 / -1' }}>
          <CustomRequirementEditor requirement={requirement} componentId={component.id} category={component.category} />
        </Box>
      )}

      {isLinked && (
        <EditServiceIntervalModal
          opened={editOpened}
          onClose={() => setEditOpened(false)}
          requirement={requirement}
          template={template}
          category={component.category}
        />
      )}
    </Box>
  )
}
