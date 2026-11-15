import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  NumberInput,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useAllComponentServiceRequirements, useCategoryServiceRequirements, useComponentServiceRequirements } from '../api/queries'
import { SERVICE_STATUS_COLORS } from '../constants'
import {
  useApplyDefaultComponentServiceRequirements,
  useDeleteComponentServiceRequirement,
  useUpdateComponentServiceRequirement,
} from '../api/mutations'
import { formatApiError } from '../api/errors'
import { confirmDelete } from './confirmDelete'
import ServiceStatusBadge from './ServiceStatusBadge'
import AddCustomServiceIntervalModal from './forms/AddCustomServiceIntervalModal'
import EditServiceIntervalModal from './forms/EditServiceIntervalModal'
import MaintenanceEventFormModal from './forms/MaintenanceEventFormModal'
import { SatisfiersEditor } from './forms/serviceRequirementShared'
import {
  CALENDAR_UNIT_OPTIONS,
  RIDE_FILTER_OPTIONS,
  activeDimensionsOf,
  hoursToSeconds,
  kmToMeters,
  metersToKm,
  secondsToHours,
} from './forms/serviceRequirementHelpers'
import { formatRemaining } from '../utils/serviceInterval'
import { formatDate } from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import type {
  CalendarUnit,
  CategoryServiceRequirement,
  ComponentDetail,
  ComponentServiceRequirementWithStatus,
  RideFilter,
} from '../types/models'

interface ServiceIntervalsSectionProps {
  component: ComponentDetail
}

// Below this width (the section's own measured width, not the viewport --
// this section renders inside AssignmentDetailModal, which is narrower than
// the window), Edit/Remove collapse into a single "..." menu so the row
// doesn't force the table wider than it needs to be. "Log service" never
// collapses.
const NARROW_ACTIONS_THRESHOLD = 700

export default function ServiceIntervalsSection({ component }: ServiceIntervalsSectionProps) {
  const { ref, width } = useElementSize()
  const narrow = width > 0 && width < NARROW_ACTIONS_THRESHOLD
  const { data: categoryTemplates } = useCategoryServiceRequirements()
  const { data: allComponentRequirements } = useAllComponentServiceRequirements()
  const [customModalOpened, setCustomModalOpened] = useState(false)
  const [addDefaultsOpened, setAddDefaultsOpened] = useState(false)
  const [logTarget, setLogTarget] = useState<{ serviceTypeId: number } | null>(null)

  // "Already has this template" is keyed by category_service_requirement_id
  // now, not by service_type_id -- a template can have more than one
  // satisfier, so "already has this service type" is no longer the right
  // dedup key (see CategoryServiceRequirementsController#apply's own check).
  const linkedTemplateIds = new Set(
    (allComponentRequirements ?? [])
      .filter((r) => r.component_id === component.id && r.category_service_requirement_id !== null)
      .map((r) => r.category_service_requirement_id),
  )
  const availableTemplates = (categoryTemplates ?? []).filter(
    (template) => template.category === component.category && !linkedTemplateIds.has(template.id),
  )

  // Before actually opening the log form, check whether this service type
  // also clears any OTHER requirement on this component -- if so, confirm
  // first ("Also clears: ..."), otherwise go straight to logging (today's
  // one-click behavior, unchanged when there's nothing else to call out).
  function handleLogService(requirementId: number, serviceTypeId: number) {
    const alsoClears = component.service_requirements
      .filter((r) => r.id !== requirementId && r.satisfiers.some((s) => s.service_type_id === serviceTypeId))
      .map((r) => r.requirement_name)

    if (alsoClears.length === 0) {
      setLogTarget({ serviceTypeId })
      return
    }

    modals.openConfirmModal({
      title: 'Log service',
      children: <Text size="sm">This also clears: {alsoClears.join(', ')}</Text>,
      labels: { confirm: 'Log service', cancel: 'Cancel' },
      onConfirm: () => setLogTarget({ serviceTypeId }),
    })
  }

  return (
    <Stack ref={ref}>
      <Group justify="space-between">
        <Title order={3}>Service requirements</Title>
        <Group>
          <Button variant="default" onClick={() => setCustomModalOpened(true)}>
            + Add custom requirement
          </Button>
          <Button
            variant="default"
            onClick={() => setAddDefaultsOpened((v) => !v)}
            disabled={availableTemplates.length === 0}
          >
            + Add from category defaults
          </Button>
        </Group>
      </Group>

      {component.service_requirements.length === 0 && <Text c="dimmed">No service requirements set up yet.</Text>}

      {component.service_requirements.length > 0 && (
        <Table.ScrollContainer minWidth={700}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Requirement</Table.Th>
                <Table.Th>Progress</Table.Th>
                <Table.Th>Remaining</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Enabled</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {component.service_requirements.map((requirement) => (
                <ServiceRequirementRow
                  key={requirement.id}
                  requirement={requirement}
                  componentId={component.id}
                  category={component.category}
                  template={categoryTemplates?.find((t) => t.id === requirement.category_service_requirement_id)}
                  narrow={narrow}
                  onLogService={(serviceTypeId) => handleLogService(requirement.id, serviceTypeId)}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {addDefaultsOpened && (
        <AddFromCategoryDefaults
          componentId={component.id}
          templates={availableTemplates}
          onDone={() => setAddDefaultsOpened(false)}
        />
      )}

      <AddCustomServiceIntervalModal
        opened={customModalOpened}
        onClose={() => setCustomModalOpened(false)}
        componentId={component.id}
      />

      <MaintenanceEventFormModal
        opened={logTarget !== null}
        onClose={() => setLogTarget(null)}
        defaultComponentId={component.id}
        defaultServiceTypeId={logTarget?.serviceTypeId}
      />
    </Stack>
  )
}

// current_position / (current_position + remaining) -- equivalent to the
// old (1 - remaining/total) shape but derived directly from the two numbers
// the backend already gives per dimension, no separate "effective
// threshold" lookup needed.
function fractionFor(requirement: ComponentServiceRequirementWithStatus): number {
  const used =
    requirement.driving_dimension === 'distance'
      ? requirement.distance_used_meters
      : requirement.driving_dimension === 'moving_time'
        ? requirement.moving_time_used_seconds
        : requirement.days_used
  const remaining =
    requirement.driving_dimension === 'distance'
      ? requirement.distance_remaining_meters
      : requirement.driving_dimension === 'moving_time'
        ? requirement.moving_time_remaining_seconds
        : requirement.days_remaining

  if (used == null || remaining == null) return 0
  const total = used + remaining
  return total > 0 ? Math.min(Math.max(used / total, 0), 1) : 0
}

function formatSettingPosition(requirement: ComponentServiceRequirementWithStatus): string {
  if (requirement.driving_dimension === 'distance') return formatDistance(Number(requirement.setting_position))
  if (requirement.driving_dimension === 'moving_time') return formatDuration(Number(requirement.setting_position))
  return formatDate(String(requirement.setting_position))
}

// "Hot wax or drip wax" (+ "· last: drip wax at 2,140 km" once a real
// service has been logged -- setting_event is null in the
// synthetic-fallback case, so that clause is simply omitted, not shown as
// blank) (+ "· outdoor/indoor rides only" when ride_filter narrows which
// rides count -- calendar time keeps counting regardless, per the editor's
// own helper text).
function SecondaryLine({ requirement }: { requirement: ComponentServiceRequirementWithStatus }) {
  const satisfierNames = requirement.satisfiers.map((s) => s.service_type_name).join(' or ')
  const lastClause = requirement.setting_event
    ? ` · last: ${requirement.setting_event.service_type_name} at ${formatSettingPosition(requirement)}`
    : ''
  const filterClause =
    requirement.ride_filter === 'outdoor'
      ? ' · outdoor rides only'
      : requirement.ride_filter === 'indoor'
        ? ' · indoor rides only'
        : ''

  return (
    <Text size="xs" c="dimmed">
      {satisfierNames}
      {lastClause}
      {filterClause}
    </Text>
  )
}

// The primary action logs the position-1 satisfier; the dropdown lists
// every other one. A single-satisfier requirement renders as a plain
// button -- nothing to put in a menu.
function LogServiceSplitButton({
  requirement,
  onLogService,
}: {
  requirement: ComponentServiceRequirementWithStatus
  onLogService: (serviceTypeId: number) => void
}) {
  const ordered = [...requirement.satisfiers].sort((a, b) => a.position - b.position)
  const [primary, ...rest] = ordered
  if (!primary) return null

  if (rest.length === 0) {
    return (
      <Button size="xs" onClick={() => onLogService(primary.service_type_id)}>
        Log service
      </Button>
    )
  }

  return (
    <Button.Group>
      <Button size="xs" onClick={() => onLogService(primary.service_type_id)}>
        Log service
      </Button>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon size="input-xs" variant="filled" aria-label="Log a different service type">
            ⌄
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {rest.map((satisfier) => (
            <Menu.Item key={satisfier.id} onClick={() => onLogService(satisfier.service_type_id)}>
              Log {satisfier.service_type_name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Button.Group>
  )
}

function ServiceRequirementRow({
  requirement,
  componentId,
  category,
  template,
  narrow,
  onLogService,
}: {
  requirement: ComponentServiceRequirementWithStatus
  componentId: number
  category: string
  template: CategoryServiceRequirement | undefined
  narrow: boolean
  onLogService: (serviceTypeId: number) => void
}) {
  const updateRequirement = useUpdateComponentServiceRequirement(requirement.id)
  const deleteRequirement = useDeleteComponentServiceRequirement()
  const [editOpened, setEditOpened] = useState(false)
  const [editingCustom, setEditingCustom] = useState(false)

  const isLinked = requirement.category_service_requirement_id !== null

  function handleToggleEnabled(checked: boolean) {
    updateRequirement.mutate({ enabled: checked })
  }

  function handleRemove() {
    confirmDelete({
      title: 'Remove service requirement',
      message: isLinked
        ? `Remove the ${requirement.requirement_name} requirement from this component? This cannot be undone. You can add it back later from category defaults.`
        : `Remove the ${requirement.requirement_name} requirement from this component? This cannot be undone.`,
      onConfirm: () => deleteRequirement.mutate(requirement.id),
    })
  }

  function handleEditClick() {
    if (isLinked) setEditOpened(true)
    else setEditingCustom((v) => !v)
  }

  const fraction = fractionFor(requirement)
  const editLabel = isLinked ? 'Edit' : editingCustom ? 'Done' : 'Edit'

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <Group gap={6} wrap="nowrap">
            <Text>{requirement.requirement_name}</Text>
            <Badge size="xs" variant="light" color="gray">
              {isLinked ? 'Default' : 'Custom'}
            </Badge>
          </Group>
          <SecondaryLine requirement={requirement} />
        </Table.Td>
        <Table.Td miw={120}>
          <Progress value={fraction * 100} color={SERVICE_STATUS_COLORS[requirement.status]} />
        </Table.Td>
        <Table.Td>
          {formatRemaining(requirement.distance_remaining_meters, requirement.days_remaining, requirement.moving_time_remaining_seconds)}
        </Table.Td>
        <Table.Td miw={90} style={{ whiteSpace: 'nowrap' }}>
          <ServiceStatusBadge status={requirement.status} />
        </Table.Td>
        <Table.Td>
          <Switch checked={requirement.enabled} onChange={(event) => handleToggleEnabled(event.currentTarget.checked)} />
        </Table.Td>
        <Table.Td>
          <Group gap="xs" wrap="nowrap">
            <LogServiceSplitButton requirement={requirement} onLogService={onLogService} />
            {narrow ? (
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="default" aria-label={`More actions for ${requirement.requirement_name}`}>
                    ⋯
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={handleEditClick}>{editLabel}</Menu.Item>
                  <Menu.Item color="red" onClick={handleRemove}>
                    Remove
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            ) : (
              <>
                <Button size="xs" variant="default" onClick={handleEditClick}>
                  {editLabel}
                </Button>
                <Button size="xs" variant="subtle" color="red" loading={deleteRequirement.isPending} onClick={handleRemove}>
                  Remove
                </Button>
              </>
            )}
          </Group>
          {updateRequirement.isError && (
            <Text c="red" size="xs" mt={4}>
              {formatApiError(updateRequirement.error)}
            </Text>
          )}
        </Table.Td>
      </Table.Tr>

      {!isLinked && editingCustom && (
        <Table.Tr>
          <Table.Td colSpan={6}>
            <CustomRequirementEditor requirement={requirement} componentId={componentId} />
          </Table.Td>
        </Table.Tr>
      )}

      {isLinked && (
        <EditServiceIntervalModal
          opened={editOpened}
          onClose={() => setEditOpened(false)}
          requirement={requirement}
          template={template}
          category={category}
        />
      )}
    </>
  )
}

// A custom row's own name/thresholds/ride_filter/satisfiers, edited inline
// -- same shared editor pieces (SatisfiersEditor + the plain
// constants/conversion helpers) CategoryServiceRequirementsModal uses for a
// template, per the plan's "Custom requirements edit satisfiers inline with
// same editor as Settings." A custom row has no inheritance of its own, so
// its effective values already ARE its raw ones -- no override concept.
function CustomRequirementEditor({
  requirement,
  componentId,
}: {
  requirement: ComponentServiceRequirementWithStatus
  componentId: number
}) {
  const updateRequirement = useUpdateComponentServiceRequirement(requirement.id)
  // requirement.satisfiers (from GET /components/:id) is already resolved
  // (nil allowance -> this requirement's own threshold) -- fine for display
  // elsewhere, but wrong here: the editor needs the RAW, possibly-null
  // allowance columns so an unset override shows its "same as requirement"
  // placeholder instead of a resolved number that looks like someone typed
  // it in. The raw CRUD endpoint is the one source of truth for that.
  const { data: rawRequirements } = useComponentServiceRequirements(componentId)
  const rawSatisfiers = rawRequirements?.find((r) => r.id === requirement.id)?.satisfiers ?? []

  const [name, setName] = useState(requirement.requirement_name)
  const [km, setKm] = useState<number | ''>(metersToKm(requirement.distance_meters))
  const [hours, setHours] = useState<number | ''>(secondsToHours(requirement.moving_time_seconds))
  const [calendarAmount, setCalendarAmount] = useState<number | ''>(requirement.calendar_amount ?? '')
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>(requirement.calendar_unit ?? 'month')
  const [rideFilter, setRideFilter] = useState<RideFilter>(requirement.ride_filter)

  function commitName() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== requirement.requirement_name) updateRequirement.mutate({ name: trimmed })
  }

  return (
    <Stack gap="xs">
      <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} onBlur={commitName} w={300} />
      <Group align="flex-end" wrap="wrap">
        <NumberInput
          label="Every (km)"
          placeholder="not used"
          value={km}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setKm(next)
            updateRequirement.mutate({ distance_meters: kmToMeters(next) })
          }}
          min={0}
          w={120}
        />
        <NumberInput
          label="Every (hours)"
          placeholder="not used"
          value={hours}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setHours(next)
            updateRequirement.mutate({ moving_time_seconds: hoursToSeconds(next) })
          }}
          min={0}
          w={120}
        />
        <Group gap={4} align="flex-end" wrap="nowrap">
          <NumberInput
            label="Every"
            placeholder="not used"
            value={calendarAmount}
            onChange={(v) => {
              const next = v === '' ? '' : Number(v)
              setCalendarAmount(next)
              updateRequirement.mutate({
                calendar_amount: next === '' ? null : next,
                calendar_unit: next === '' ? null : calendarUnit,
              })
            }}
            min={0}
            w={90}
          />
          <Select
            data={CALENDAR_UNIT_OPTIONS}
            value={calendarUnit}
            onChange={(v) => {
              const next = (v as CalendarUnit | null) ?? 'month'
              setCalendarUnit(next)
              if (calendarAmount !== '') updateRequirement.mutate({ calendar_unit: next })
            }}
            w={100}
            allowDeselect={false}
          />
        </Group>
      </Group>

      <div>
        <Text size="sm" fw={500} mb={4}>
          Counts
        </Text>
        <SegmentedControl
          data={RIDE_FILTER_OPTIONS}
          value={rideFilter}
          onChange={(v) => {
            const next = v as RideFilter
            setRideFilter(next)
            updateRequirement.mutate({ ride_filter: next })
          }}
        />
        {rideFilter !== 'all' && calendarAmount !== '' && (
          <Text size="xs" c="dimmed" mt={4}>
            Calendar time keeps counting on indoor rides.
          </Text>
        )}
      </div>

      {updateRequirement.isError && <Alert color="red">{formatApiError(updateRequirement.error)}</Alert>}

      <SatisfiersEditor
        owner={{ type: 'component', id: requirement.id }}
        satisfiers={rawSatisfiers}
        activeDimensions={activeDimensionsOf(requirement)}
      />
    </Stack>
  )
}

function AddFromCategoryDefaults({
  componentId,
  templates,
  onDone,
}: {
  componentId: number
  templates: CategoryServiceRequirement[]
  onDone: () => void
}) {
  const applyDefaults = useApplyDefaultComponentServiceRequirements()
  const [checked, setChecked] = useState<Set<number>>(new Set(templates.map((t) => t.id)))

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleApply() {
    applyDefaults.mutate({ componentId, categoryServiceRequirementIds: Array.from(checked) }, { onSuccess: onDone })
  }

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
      <Text fw={500} size="sm">
        Add from category defaults
      </Text>
      {templates.map((template) => (
        <Checkbox key={template.id} label={template.name} checked={checked.has(template.id)} onChange={() => toggle(template.id)} />
      ))}
      {applyDefaults.isError && <Alert color="red">{formatApiError(applyDefaults.error)}</Alert>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={handleApply} disabled={checked.size === 0} loading={applyDefaults.isPending}>
          Add selected
        </Button>
      </Group>
    </Stack>
  )
}
