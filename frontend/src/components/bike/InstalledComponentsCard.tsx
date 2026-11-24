import { useMemo, type ReactNode } from 'react'
import { Alert, Box, Button, Group, Loader, Menu, Stack, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useComponentAssignments, useComponentCategorySettings, useComponents, useTableViewPreference } from '../../api/queries'
import { useCreateBikeComponentSlot } from '../../api/mutations'
import ComponentSwapPill from '../ComponentSwapPill'
import RideContextChip from '../RideContextChip'
import PageSection from '../PageSection'
import DataList from '../datalist/DataList'
import DataListHeader, { type DataListColumn } from '../datalist/DataListHeader'
import DataListRow from '../datalist/DataListRow'
import FieldsPicker from '../datalist/FieldsPicker'
import { dataListMinWidth, dataListTemplate, fieldMinWidth } from '../datalist/dataListModel'
import WearBar from '../dashboard/WearBar'
import EmptySlotPill from './EmptySlotPill'
import { BIKE_SECTION_STORAGE_KEYS } from './bikeSectionsModel'
import { installedComponentRenderer } from './installedComponentColumns'
import {
  activeElsewhereByComponent,
  addableSlotOptions,
  installedRows,
  orderSlots,
  installedFoldedSummary,
  installedSummaryLine,
  sortInstalledRows,
  type AddableSlotOption,
  type InstalledRow,
} from './installedComponentsModel'
import { useAllCategories } from '../../hooks/useAllCategories'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import {
  categoryLabel,
  DEFAULT_INSTALLED_COMPONENT_COLUMNS,
  INSTALLED_COMPONENT_COLUMN_DESCRIPTIONS,
  INSTALLED_COMPONENT_COLUMN_LABELS,
  INSTALLED_COMPONENT_COLUMNS,
  INSTALLED_COMPONENT_SORT_COLUMNS,
  RIDE_CONTEXT_LABELS,
  type InstalledComponentColumn,
  type InstalledComponentSortColumn,
} from '../../constants'
import { componentWearValue } from '../../utils/wear'
import type {
  BikeDetail,
  Component,
  ComponentAssignmentWithStats,
  ComponentCategorySetting,
  TableViewPreferenceData,
} from '../../types/models'

const SECTION_ID = 'installed'
const TITLE = 'Installed components'
const FIELD_OPTIONS = INSTALLED_COMPONENT_COLUMNS.map((column) => ({
  key: column,
  label: INSTALLED_COMPONENT_COLUMN_LABELS[column],
  description: INSTALLED_COMPONENT_COLUMN_DESCRIPTIONS[column],
}))
// The fixed columns' minimums, each checked against its label too.
const CATEGORY_MIN = fieldMinWidth('Category', 110)
const COMPONENT_MIN = fieldMinWidth('Component', 200)
const CONTEXT_MIN = fieldMinWidth('Ride context', 90)
const WEAR_MIN = fieldMinWidth('Wear', 190)
const fieldMin = (column: InstalledComponentColumn) => fieldMinWidth(INSTALLED_COMPONENT_COLUMN_LABELS[column])

interface Props {
  bike: BikeDetail
  onOpenAssignment: (assignment: ComponentAssignmentWithStats) => void
}

interface InnerProps extends Props {
  rows: InstalledRow[]
  allCategories: readonly string[]
  categorySettings: ComponentCategorySetting[] | undefined
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
  initialData: TableViewPreferenceData
}

// The bike's slots as one DataList under a PageSection header (title,
// "13 installed · 1 empty slot", Fields and + Track component type):
// Category | the swap pill | ride context | wear | the chosen Fields
// (saved in bike_installed_components). A filled row opens the
// installation modal (Remove lives there); an empty slot stays in place,
// muted, with a dashed pill to fill it. A phone gets the same rows stacked.
export default function InstalledComponentsCard({ bike, onOpenAssignment }: Props) {
  const { data: preferenceData, isPending } = useTableViewPreference('bike_installed_components')
  // Every assignment of the user's: what's mounted on other bikes decides
  // which components an empty slot may take.
  const { data: assignments, isPending: assignmentsPending } = useComponentAssignments()
  const { data: components } = useComponents()
  const { data: categorySettings } = useComponentCategorySettings()
  const allCategories = useAllCategories()
  const orderedSlots = useMemo(() => orderSlots(bike.bike_component_slots, allCategories), [bike.bike_component_slots, allCategories])
  const elsewhere = useMemo(() => activeElsewhereByComponent(assignments ?? [], bike.id), [assignments, bike.id])
  const rows = useMemo(
    () => installedRows(orderedSlots, bike.component_assignments, bike.overview.mounted),
    [orderedSlots, bike.component_assignments, bike.overview.mounted],
  )

  // useTableViewPreferences seeds from the preference once, on mount.
  if (isPending || !preferenceData || assignmentsPending) {
    return (
      <PageSection
        id={SECTION_ID}
        title={TITLE}
        summary={installedSummaryLine(rows)}
        foldedSummary={installedFoldedSummary(rows)}
        storageKey={BIKE_SECTION_STORAGE_KEYS.installed}
      >
        <Loader />
      </PageSection>
    )
  }
  return (
    <InstalledComponentsCardInner
      bike={bike}
      onOpenAssignment={onOpenAssignment}
      rows={rows}
      allCategories={allCategories}
      categorySettings={categorySettings}
      components={components ?? []}
      activeAssignmentsElsewhereByComponentId={elsewhere}
      initialData={preferenceData.data}
    />
  )
}

function InstalledComponentsCardInner({
  bike,
  rows,
  allCategories,
  categorySettings,
  components,
  activeAssignmentsElsewhereByComponentId,
  onOpenAssignment,
  initialData,
}: InnerProps) {
  const isMobile = useIsMobile()
  const table = useTableViewPreferences<InstalledComponentColumn, InstalledComponentSortColumn>({
    tableKey: 'bike_installed_components',
    initialData,
    allColumns: INSTALLED_COMPONENT_COLUMNS,
    defaultColumns: DEFAULT_INSTALLED_COMPONENT_COLUMNS,
    sortColumns: INSTALLED_COMPONENT_SORT_COLUMNS,
    defaultSort: { column: 'category', direction: 'asc' },
  })
  const { orderedColumns: fields, sortColumn, sortDirection, setSort } = table

  const sorted = useMemo(() => sortInstalledRows(rows, sortColumn, sortDirection), [rows, sortColumn, sortDirection])
  const addable = addableSlotOptions(allCategories, bike.bike_component_slots, categorySettings)

  const template = dataListTemplate({
    leading: [`minmax(${CATEGORY_MIN}px, auto)`],
    main: `minmax(${COMPONENT_MIN}px, 1.2fr)`,
    fields: [`minmax(${CONTEXT_MIN}px, auto)`, `minmax(${WEAR_MIN}px, 1fr)`, ...fields.map((column) => `minmax(${fieldMin(column)}px, auto)`)],
  })
  const minWidth = dataListMinWidth({
    leading: [CATEGORY_MIN],
    main: COMPONENT_MIN,
    fields: [CONTEXT_MIN, WEAR_MIN, ...fields.map(fieldMin)],
  })
  const columns: DataListColumn<InstalledComponentSortColumn>[] = [
    { key: 'category', label: 'Category' },
    { key: 'component_label', label: 'Component' },
    { key: 'ride_context', label: 'Ride context' },
    { key: 'wear', label: 'Wear' },
    ...fields.map((column) => ({
      key: column,
      label: INSTALLED_COMPONENT_COLUMN_LABELS[column],
      description: INSTALLED_COMPONENT_COLUMN_DESCRIPTIONS[column],
      align: 'right' as const,
    })),
  ]

  // A new column starts biggest-first; Category and Component A-Z.
  function onSort(column: InstalledComponentSortColumn) {
    if (column === sortColumn) setSort(column, sortDirection === 'asc' ? 'desc' : 'asc')
    else setSort(column, column === 'category' || column === 'component_label' || column === 'ride_context' ? 'asc' : 'desc')
  }

  const rowProps = { bike, components, activeAssignmentsElsewhereByComponentId, fields, onOpenAssignment }

  return (
    <PageSection
      id={SECTION_ID}
      title={TITLE}
      summary={installedSummaryLine(rows)}
      foldedSummary={installedFoldedSummary(rows)}
      storageKey={BIKE_SECTION_STORAGE_KEYS.installed}
      actions={
        <>
          {!isMobile && (
            <FieldsPicker
              all={FIELD_OPTIONS}
              visible={fields}
              onToggle={(key) => table.toggleColumn(key as InstalledComponentColumn)}
              onReorder={(activeKey, overKey) =>
                table.reorderColumn(activeKey as InstalledComponentColumn, overKey as InstalledComponentColumn)
              }
            />
          )}
          <TrackComponentTypeMenu bikeId={bike.id} options={addable} />
        </>
      }
    >
      <Stack gap="sm">
        {table.saveError && (
          <Alert color="red" withCloseButton onClose={table.clearSaveError}>
            {table.saveError}
          </Alert>
        )}

        {rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            No component types tracked yet. Track one above, or use Set up components.
          </Text>
        ) : (
          <DataList template={template} minWidth={minWidth} stacked={isMobile}>
            {!isMobile && <DataListHeader columns={columns} sortColumn={sortColumn} order={sortDirection} onSort={onSort} />}
            {sorted.map((row) =>
              isMobile ? (
                <PhoneRow key={row.slot.id} row={row} {...rowProps} />
              ) : (
                <GridRow key={row.slot.id} row={row} {...rowProps} />
              ),
            )}
          </DataList>
        )}
      </Stack>
    </PageSection>
  )
}

interface RowProps {
  row: InstalledRow
  bike: BikeDetail
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
  fields: InstalledComponentColumn[]
  onOpenAssignment: (assignment: ComponentAssignmentWithStats) => void
}

// The pill's own clicks and keys mustn't reach the row: React events bubble
// through portals, so a click in its dropdown would otherwise open the row.
function Isolated({ children }: { children: ReactNode }) {
  return (
    <Box onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} style={{ minWidth: 0 }}>
      {children}
    </Box>
  )
}

// Wear from the worst requirement: the bar plus what's left or over; a
// faint empty bar and "No interval" without one.
function WearCell({ row }: { row: InstalledRow }) {
  const wear = row.wear
  const hasInterval = Boolean(wear?.driving_dimension)
  return (
    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
      <WearBar
        fraction={wear?.fraction_used ?? null}
        status={wear?.service_status ?? null}
        style={{ flex: 1, minWidth: 48, opacity: hasInterval ? undefined : 0.5 }}
      />
      <Text size="sm" c={wear?.service_status === 'due' ? 'red' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
        {wear && hasInterval ? componentWearValue(wear) : 'No interval'}
      </Text>
    </Group>
  )
}

function EmptyPill({ row, bike, components, activeAssignmentsElsewhereByComponentId }: RowProps) {
  return (
    <EmptySlotPill
      bike={bike}
      slot={row.slot}
      hasHistory={bike.component_assignments.some((a) => a.component.category === row.slot.category)}
      components={components}
      activeAssignmentsElsewhereByComponentId={activeAssignmentsElsewhereByComponentId}
    />
  )
}

function GridRow(props: RowProps) {
  const { row, fields, onOpenAssignment } = props
  const { slot, assignment } = row
  const category = (
    <Text size="sm" c="dimmed" truncate>
      {categoryLabel(slot.category)}
    </Text>
  )

  if (!assignment) {
    return (
      <DataListRow tone="muted">
        {category}
        <Box style={{ gridColumn: '2 / -1' }}>
          <Group gap="sm" wrap="nowrap">
            <EmptyPill {...props} />
            <RideContextChip rideContext={slot.ride_context} />
          </Group>
        </Box>
      </DataListRow>
    )
  }

  return (
    <DataListRow ariaLabel={`${assignment.component.label}, open installation`} onOpen={() => onOpenAssignment(assignment)}>
      {category}
      <Isolated>
        <ComponentSwapPill assignment={assignment} />
      </Isolated>
      <div>
        <RideContextChip rideContext={assignment.ride_context} showBoth />
      </div>
      <WearCell row={row} />
      {fields.map((column) => {
        const bold = column === 'component_total_distance'
        return (
          <Text
            key={column}
            component="div"
            size="sm"
            ta="right"
            c={bold ? undefined : 'dimmed'}
            fw={bold ? 600 : undefined}
            style={{ whiteSpace: 'nowrap' }}
          >
            {installedComponentRenderer[column](assignment)}
          </Text>
        )
      })}
    </DataListRow>
  )
}

// Phone: category, the pill (and context chip), the wear bar and value,
// then the chosen fields as one dimmed line.
function PhoneRow(props: RowProps) {
  const { row, fields, onOpenAssignment } = props
  const { slot, assignment } = row

  return (
    <DataListRow
      stacked
      tone={assignment ? undefined : 'muted'}
      ariaLabel={assignment ? `${assignment.component.label}, open installation` : undefined}
      onOpen={assignment ? () => onOpenAssignment(assignment) : undefined}
    >
      <Stack gap={6}>
        <Text size="xs" c="dimmed">
          {categoryLabel(slot.category)}
        </Text>
        <Group gap="xs" wrap="wrap">
          {assignment ? (
            <Isolated>
              <ComponentSwapPill assignment={assignment} />
            </Isolated>
          ) : (
            <EmptyPill {...props} />
          )}
          <RideContextChip rideContext={assignment?.ride_context ?? slot.ride_context} />
        </Group>
        {assignment && <WearCell row={row} />}
        {assignment && fields.length > 0 && (
          <Text size="xs" c="dimmed">
            {fields.map((column) => (
              <span key={column}>
                {column !== fields[0] && ' · '}
                {INSTALLED_COMPONENT_COLUMN_LABELS[column]} {installedComponentRenderer[column](assignment)}
              </span>
            ))}
          </Text>
        )}
      </Stack>
    </DataListRow>
  )
}

// "+ Track component type": the categories (and split variants) the bike
// doesn't track yet; choosing one adds the slot.
function TrackComponentTypeMenu({ bikeId, options }: { bikeId: number; options: AddableSlotOption[] }) {
  const createSlot = useCreateBikeComponentSlot()
  if (options.length === 0) return null

  return (
    <Menu position="bottom-end" shadow="md" withinPortal>
      <Menu.Target>
        <Button size="xs" radius="xl" variant="default" leftSection={<IconPlus size={14} />} loading={createSlot.isPending}>
          Track component type
        </Button>
      </Menu.Target>
      <Menu.Dropdown mah={360} style={{ overflowY: 'auto' }}>
        {options.map(({ category, rideContext }) => (
          <Menu.Item
            key={`${category}::${rideContext}`}
            onClick={() => createSlot.mutate({ bike_id: bikeId, category, ride_context: rideContext })}
          >
            {rideContext === 'both' ? categoryLabel(category) : `${categoryLabel(category)} (${RIDE_CONTEXT_LABELS[rideContext]})`}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
