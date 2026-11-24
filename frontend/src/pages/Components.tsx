import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { IconAdjustmentsHorizontal } from '@tabler/icons-react'
import { useBikes, useComponents, useTableViewPreference } from '../api/queries'
import ComponentsList from '../components/componentList/ComponentsList'
import ComponentsSummaryTiles from '../components/componentList/ComponentsSummaryTiles'
import ComponentsToolbar from '../components/componentList/ComponentsToolbar'
import ComponentsViewSheet from '../components/componentList/ComponentsViewSheet'
import { compareCategory, componentTileCounts, filterComponents } from '../components/componentList/componentListModel'
import { useComponentsView } from '../components/componentList/useComponentsView'
import ComponentFormModal from '../components/forms/ComponentFormModal'
import RetireComponentModal from '../components/forms/RetireComponentModal'
import { useAllCategories } from '../hooks/useAllCategories'
import { useIsMobile } from '../hooks/useIsMobile'
import { categoryLabel, COMPONENT_LIST_FIELD_LABELS, COMPONENT_LIST_FIELDS } from '../constants'
import type { ComponentListItem, TableViewPreferenceData } from '../types/models'

const FIELD_OPTIONS = COMPONENT_LIST_FIELDS.map((field) => ({ key: field, label: COMPONENT_LIST_FIELD_LABELS[field] }))

// The Components list (docs/frontend-ui.md, "Components page"): a header
// with + New component, a TileRow of counts, the toolbar (state pills,
// Group by, Fields, search and filters), then the DataList. Rows open the
// component; Retire stays on each row, Edit and Delete are on its page.
export default function Components() {
  const { data, isPending, isError, error } = useComponents()
  const { data: preferenceData, isPending: preferencePending } = useTableViewPreference('components')
  const [createOpened, setCreateOpened] = useState(false)

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>Components</Title>
          <Text size="sm" c="dimmed">
            Every part you track, on a bike or on the shelf
          </Text>
        </div>
        <Button onClick={() => setCreateOpened(true)}>+ New component</Button>
      </Group>

      {(isPending || preferencePending) && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load components">
          {error.message}
        </Alert>
      )}

      {/* useComponentsView seeds from the preference once, on mount. */}
      {data && preferenceData && (
        <ComponentsContent components={data} initialData={preferenceData.data} onCreate={() => setCreateOpened(true)} />
      )}

      <ComponentFormModal opened={createOpened} onClose={() => setCreateOpened(false)} />
    </Stack>
  )
}

function ComponentsContent({
  components,
  initialData,
  onCreate,
}: {
  components: ComponentListItem[]
  initialData: TableViewPreferenceData
  onCreate: () => void
}) {
  const view = useComponentsView(initialData)
  const { data: bikes } = useBikes()
  const categoryOrder = useAllCategories()
  const [retiringId, setRetiringId] = useState<number | null>(null)
  const [viewSheetOpened, setViewSheetOpened] = useState(false)
  // A phone gets stacked rows; it has no headers, so sort moves to the
  // View sheet.
  const isMobile = useIsMobile()

  const counts = componentTileCounts(components)

  // Filter options: categories in use, in the app's order; every bike A-Z.
  // A saved category or bike that no longer exists reads as unset.
  const categoryOptions = useMemo(() => {
    const used = [...new Set(components.map((component) => component.category))]
    used.sort((a, b) => compareCategory(a, b, categoryOrder))
    return used.map((category) => ({ value: category, label: categoryLabel(category) }))
  }, [components, categoryOrder])
  const bikeOptions = useMemo(
    () =>
      (bikes ?? [])
        .map((bike) => ({ value: bike.id, label: bike.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [bikes],
  )
  const category = categoryOptions.some((option) => option.value === view.category) ? view.category : null
  const bikeId = bikeOptions.some((option) => option.value === view.bikeId) ? view.bikeId : null

  const filtered = filterComponents(components, {
    states: view.states,
    q: view.q,
    category,
    bikeId,
    service: view.service,
  })

  return (
    <>
      <ComponentsSummaryTiles counts={counts} />
      <ComponentsToolbar
        view={view}
        counts={counts}
        category={category}
        bikeId={bikeId}
        categoryOptions={categoryOptions}
        bikeOptions={bikeOptions}
        fieldOptions={FIELD_OPTIONS}
        phoneViewButton={
          <Button
            size="xs"
            radius="xl"
            variant="default"
            leftSection={<IconAdjustmentsHorizontal size={14} />}
            onClick={() => setViewSheetOpened(true)}
            hiddenFrom="sm"
          >
            View
          </Button>
        }
      />
      {view.table.saveError && (
        <Alert color="red" withCloseButton onClose={view.table.clearSaveError}>
          {view.table.saveError}
        </Alert>
      )}

      {components.length === 0 ? (
        <EmptyState title="No components yet" action={<Button onClick={onCreate}>+ New component</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No components match these filters"
          action={
            view.hasActiveFilters ? (
              <Button variant="default" radius="xl" onClick={view.clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Text size="sm" c="dimmed">
                Turn on Installed, Spare or Retired above.
              </Text>
            )
          }
        />
      ) : (
        <ComponentsList
          components={filtered}
          view={view}
          groupBy={view.groupBy}
          categoryOrder={categoryOrder}
          stacked={isMobile}
          onRetire={(component) => setRetiringId(component.id)}
        />
      )}

      <ComponentsViewSheet opened={viewSheetOpened} onClose={() => setViewSheetOpened(false)} view={view} />

      {retiringId !== null && (
        <RetireComponentModal opened onClose={() => setRetiringId(null)} componentId={retiringId} />
      )}
    </>
  )
}

function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="xl">
      <Stack align="center" gap="sm">
        <Text fw={500}>{title}</Text>
        {action}
      </Stack>
    </Paper>
  )
}
