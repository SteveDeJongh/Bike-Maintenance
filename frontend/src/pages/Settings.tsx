import { Alert, Checkbox, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { COMPONENT_CATEGORIES, categoryLabel } from '../constants'
import { useComponentCategorySettings } from '../api/queries'
import { useUpdateComponentCategorySetting } from '../api/mutations'
import RideContextCheckboxes from '../components/RideContextCheckboxes'
import type { ComponentCategorySetting } from '../types/models'

export default function Settings() {
  return (
    <Stack>
      <Title order={2}>Settings</Title>
      <ComponentCategorySettingsSection />
    </Stack>
  )
}

function ComponentCategorySettingsSection() {
  const { data: settings, isPending, isError, error } = useComponentCategorySettings()

  return (
    <Stack>
      <Title order={3}>Component Categories</Title>
      <Text c="dimmed">
        Per-category defaults: which ride types a new component of this category defaults to
        accruing mileage from, whether the category is offered when tracking a new component on
        a bike or creating a new component, and whether a second, complementary-context
        component (e.g. a dedicated outdoor cassette alongside a dedicated trainer cassette) can
        be installed in the same slot at once.
      </Text>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load category settings">
          {error.message}
        </Alert>
      )}

      {settings && (
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
            {COMPONENT_CATEGORIES.map((category) => (
              <CategoryRow
                key={category}
                category={category}
                setting={settings.find((s) => s.category === category)}
              />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}

function CategoryRow({
  category,
  setting,
}: {
  category: string
  setting: ComponentCategorySetting | undefined
}) {
  const updateSetting = useUpdateComponentCategorySetting(category)
  const defaultRideContext = setting?.default_ride_context ?? 'both'
  const trackable = setting?.trackable ?? true
  const allowsMultiple = setting?.allows_multiple_assignments ?? false

  return (
    <Table.Tr>
      <Table.Td>{categoryLabel(category)}</Table.Td>
      <Table.Td>
        <RideContextCheckboxes
          value={defaultRideContext}
          onChange={(value) => updateSetting.mutate({ default_ride_context: value })}
        />
      </Table.Td>
      <Table.Td>
        <Checkbox
          checked={trackable}
          onChange={(event) => updateSetting.mutate({ trackable: event.currentTarget.checked })}
          disabled={updateSetting.isPending}
        />
      </Table.Td>
      <Table.Td>
        <Checkbox
          checked={allowsMultiple}
          onChange={(event) => updateSetting.mutate({ allows_multiple_assignments: event.currentTarget.checked })}
          disabled={updateSetting.isPending}
        />
      </Table.Td>
    </Table.Tr>
  )
}
