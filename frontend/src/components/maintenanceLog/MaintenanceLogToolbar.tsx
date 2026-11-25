import type { CSSProperties } from 'react'
import { Badge, Box, Button, Group, Paper, SegmentedControl, Text, TextInput } from '@mantine/core'
import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react'
import FieldsPicker from '../datalist/FieldsPicker'
import DateRangePill from '../toolbar/DateRangePill'
import { Dot, FilterMenu, Pill } from '../toolbar/ToolbarPills'
import { categoryLabel } from '../../constants'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import { FIELD_OPTIONS, MAX_MAINTENANCE_FIELDS, type MaintenanceField } from './maintenanceLogFields'
import {
  GROUP_BY_OPTIONS,
  MAINTENANCE_KIND_LABELS,
  MAINTENANCE_KINDS,
  type MaintenanceGroupBy,
  type MaintenanceKind,
} from './maintenanceLogModel'
import type { MaintenanceLogView } from './useMaintenanceLogView'
import type { Bike, MaintenanceLogMeta, ServiceType } from '../../types/models'

const TEAL = 'var(--mantine-color-teal-6)'

// Sessions: a filled teal dot; single events: a teal ring.
function KindMark({ kind }: { kind: MaintenanceKind }) {
  if (kind === 'session') return <Dot color={TEAL} />
  return <Box w={8} h={8} style={{ borderRadius: '50%', border: `2px solid ${TEAL}`, flexShrink: 0 }} />
}

// Activity's toolbar card. Row 1: the kind pills, then (from sm up) Group
// by and Fields; on a phone a View button (badge: non-default choices)
// opens MaintenanceLogViewSheet instead. Row 2: search, the Bike /
// Category / Service type / Date range pills and Clear filters -- on a
// phone, search goes full width and the pills scroll sideways under it.
export default function MaintenanceLogToolbar({
  view,
  kindCounts,
  bikes,
  categories,
  serviceTypes,
  onOpenView,
}: {
  view: MaintenanceLogView
  kindCounts: MaintenanceLogMeta['kind_counts'] | undefined
  bikes: Bike[] | undefined
  categories: string[]
  serviceTypes: ServiceType[] | undefined
  onOpenView: () => void
}) {
  const bikeName = bikes?.find((bike) => bike.id === view.bikeId)?.name
  const typeName = serviceTypes?.find((type) => type.id === view.serviceTypeId)?.name

  // The phone's copy gets 44px tap targets.
  const filterPills = (tap?: CSSProperties) => (
    <>
      <FilterMenu
        style={tap}
        label={bikeName ?? 'Bike'}
        active={view.bikeId != null}
        options={(bikes ?? []).map((bike) => ({ value: bike.id, label: bike.name }))}
        allLabel="All bikes"
        onSelect={(value) => view.setBikeId(value ?? undefined)}
      />
      <FilterMenu
        style={tap}
        label={view.category ? categoryLabel(view.category) : 'Category'}
        active={view.category != null}
        options={categories.map((category) => ({ value: category, label: categoryLabel(category) }))}
        allLabel="All categories"
        onSelect={(value) => view.setCategory(value ?? undefined)}
      />
      <FilterMenu
        style={tap}
        label={typeName ?? 'Service type'}
        active={view.serviceTypeId != null}
        options={(serviceTypes ?? []).map((type) => ({ value: type.id, label: type.name }))}
        allLabel="All service types"
        onSelect={(value) => view.setServiceTypeId(value ?? undefined)}
      />
      <DateRangePill
        preset={view.datePreset}
        onPresetChange={view.setDatePreset}
        customRange={view.customRange}
        onCustomRangeChange={view.setCustomRange}
        style={tap}
      />
      {view.hasActiveFilters && (
        <Button size="xs" variant="subtle" radius="xl" onClick={view.clearFilters} style={{ flexShrink: 0, ...tap }}>
          Clear filters
        </Button>
      )}
    </>
  )

  const search = (size: 'xs' | 'md') => (
    <TextInput
      radius="xl"
      size={size}
      leftSection={<IconSearch size={14} />}
      placeholder="Search service, component or note"
      aria-label="Search service, component or note"
      value={view.qInput}
      onChange={(event) => view.setQInput(event.currentTarget.value)}
    />
  )

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="wrap" gap="sm" visibleFrom="sm">
        <Group gap="xs" wrap="wrap">
          {MAINTENANCE_KINDS.map((kind) => (
            <Pill key={kind} active={view.kinds.includes(kind)} onClick={() => view.toggleKind(kind)} leftSection={<KindMark kind={kind} />}>
              {MAINTENANCE_KIND_LABELS[kind]} · {kindCounts?.[kind] ?? 0}
            </Pill>
          ))}
        </Group>

        <Group gap="sm" wrap="nowrap">
          <Text size="sm" c="dimmed">
            Group by
          </Text>
          <SegmentedControl
            size="xs"
            radius="xl"
            value={view.groupBy}
            onChange={(value) => view.setGroupBy(value as MaintenanceGroupBy)}
            data={GROUP_BY_OPTIONS}
          />
          <FieldsPicker
            all={FIELD_OPTIONS}
            visible={view.fields}
            cap={MAX_MAINTENANCE_FIELDS}
            onToggle={(key) => view.toggleField(key as MaintenanceField)}
            onReorder={(activeKey, overKey) => view.reorderColumn(activeKey as MaintenanceField, overKey as MaintenanceField)}
          />
        </Group>
      </Group>

      <Group gap="xs" wrap="wrap" mt="sm" visibleFrom="sm">
        <Box w={280}>{search('xs')}</Box>
        {filterPills()}
      </Group>

      {/* Phone: full-width search + View, then the pills scrolling sideways. */}
      <Box hiddenFrom="sm">
        <Group gap="xs" wrap="nowrap">
          <Box style={{ flex: 1 }}>{search('md')}</Box>
          <Button
            size="xs"
            radius="xl"
            variant="default"
            leftSection={<IconAdjustmentsHorizontal size={14} />}
            rightSection={
              view.viewBadge > 0 ? (
                <Badge size="xs" circle>
                  {view.viewBadge}
                </Badge>
              ) : undefined
            }
            onClick={onOpenView}
            style={MOBILE_TAP_TARGET_STYLE}
          >
            View
          </Button>
        </Group>
        <Group gap="xs" wrap="nowrap" mt="xs" style={{ overflowX: 'auto', paddingBottom: 2 }}>
          {filterPills(MOBILE_TAP_TARGET_STYLE)}
        </Group>
      </Box>
    </Paper>
  )
}
