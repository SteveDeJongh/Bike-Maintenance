import { useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Group, Loader, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useComponentCategorySettings } from '../../api/queries'
import { useSaveComponentCategorySettings } from '../../api/mutations'
import RideContextCheckboxes from '../../components/RideContextCheckboxes'
import { categoryLabel } from '../../constants'
import type { ComponentCategorySetting } from '../../types/models'
import { useAllCategories } from '../../hooks/useAllCategories'

interface CategoryFormValues {
  default_ride_context: 'both' | 'outdoor_only' | 'indoor_only'
  trackable: boolean
  allows_multiple_assignments: boolean
}

const DEFAULT_VALUES: CategoryFormValues = {
  default_ride_context: 'both',
  trackable: true,
  allows_multiple_assignments: false,
}

function settingToValues(setting: ComponentCategorySetting | undefined): CategoryFormValues {
  return {
    default_ride_context: setting?.default_ride_context ?? DEFAULT_VALUES.default_ride_context,
    trackable: setting?.trackable ?? DEFAULT_VALUES.trackable,
    allows_multiple_assignments: setting?.allows_multiple_assignments ?? DEFAULT_VALUES.allows_multiple_assignments,
  }
}

function slugifyCategory(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function ComponentCategorySettingsPage() {
  const { data: settings, isPending, isError, error } = useComponentCategorySettings()
  const allCategories = useAllCategories()
  const [saveVersion, setSaveVersion] = useState(0)

  return (
    <Stack>
      <Title order={3}>Component Categories</Title>
      <Text c="dimmed">
        Per-category defaults: which ride types a new component of this category defaults to
        accruing mileage from, whether the category is offered when tracking a new component on
        a bike or creating a new component, and whether a second, complementary-context
        component (e.g. a dedicated outdoor cassette alongside a dedicated trainer cassette) can
        be installed in the same slot at once. Changes are staged below and only take effect once
        you click Save.
      </Text>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load category settings">
          {error.message}
        </Alert>
      )}

      {settings && (
        <CategoryTable
          key={saveVersion}
          categories={allCategories}
          settings={settings}
          onSaved={() => setSaveVersion((v) => v + 1)}
        />
      )}
    </Stack>
  )
}

function CategoryTable({
  categories,
  settings,
  onSaved,
}: {
  categories: string[]
  settings: ComponentCategorySetting[]
  onSaved: () => void
}) {
  const baseline = useMemo(() => {
    const map: Record<string, CategoryFormValues> = {}
    for (const category of categories) {
      map[category] = settingToValues(settings.find((s) => s.category === category))
    }
    return map
  }, [categories, settings])

  const [localValues, setLocalValues] = useState(baseline)
  const [newCategories, setNewCategories] = useState<string[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const saveSettings = useSaveComponentCategorySettings()

  const allRows = [...categories, ...newCategories]

  function updateLocal(category: string, changes: Partial<CategoryFormValues>) {
    setLocalValues((prev) => ({
      ...prev,
      [category]: { ...(prev[category] ?? DEFAULT_VALUES), ...changes },
    }))
  }

  function handleAddCategory() {
    const slug = slugifyCategory(newCategoryName)
    if (!slug || allRows.includes(slug)) return

    setNewCategories((prev) => [...prev, slug])
    setLocalValues((prev) => ({ ...prev, [slug]: { ...DEFAULT_VALUES } }))
    setNewCategoryName('')
  }

  const dirtyCategories = allRows.filter((category) => {
    if (newCategories.includes(category)) return true
    return JSON.stringify(localValues[category]) !== JSON.stringify(baseline[category])
  })

  function handleSave() {
    saveSettings.mutate(
      dirtyCategories.map((category) => ({ category, changes: localValues[category] })),
      { onSuccess: onSaved },
    )
  }

  return (
    <Stack>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Category</Table.Th>
            <Table.Th>Default ride context</Table.Th>
            <Table.Th>Trackable</Table.Th>
            <Table.Th>Allows multiple installed at once</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {allRows.map((category) => (
            <Table.Tr key={category}>
              <Table.Td>{categoryLabel(category)}</Table.Td>
              <Table.Td>
                <RideContextCheckboxes
                  value={localValues[category].default_ride_context}
                  onChange={(value) => updateLocal(category, { default_ride_context: value })}
                />
              </Table.Td>
              <Table.Td>
                <Checkbox
                  checked={localValues[category].trackable}
                  onChange={(event) => updateLocal(category, { trackable: event.currentTarget.checked })}
                  disabled={saveSettings.isPending}
                />
              </Table.Td>
              <Table.Td>
                <Checkbox
                  checked={localValues[category].allows_multiple_assignments}
                  onChange={(event) =>
                    updateLocal(category, { allows_multiple_assignments: event.currentTarget.checked })
                  }
                  disabled={saveSettings.isPending}
                />
              </Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td>
              <TextInput
                placeholder="New category name"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.currentTarget.value)}
                disabled={saveSettings.isPending}
              />
            </Table.Td>
            <Table.Td colSpan={3}>
              <Button
                size="sm"
                variant="default"
                disabled={!slugifyCategory(newCategoryName) || saveSettings.isPending}
                onClick={handleAddCategory}
              >
                Add category
              </Button>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      {saveSettings.isError && (
        <Alert color="red" title="Failed to save">
          {saveSettings.error.message}
        </Alert>
      )}

      <Group justify="flex-end">
        <Button onClick={handleSave} disabled={dirtyCategories.length === 0} loading={saveSettings.isPending}>
          Save
        </Button>
      </Group>
    </Stack>
  )
}
