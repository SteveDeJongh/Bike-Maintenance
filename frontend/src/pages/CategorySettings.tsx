import { Alert, Checkbox, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { COMPONENT_CATEGORIES, categoryLabel } from '../constants'
import { useComponentCategorySettings } from '../api/queries'
import { useUpdateComponentCategorySetting } from '../api/mutations'

export default function CategorySettings() {
  const { data: settings, isPending, isError, error } = useComponentCategorySettings()

  return (
    <Stack>
      <Title order={2}>Category Settings</Title>
      <Text c="dimmed">
        Controls whether a component category accrues mileage on the trainer by default when a
        new assignment is installed. This is just a default — any individual assignment's
        Outdoor/Trainer checkboxes can still be set however it needs, regardless of its
        category's setting here.
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
              <Table.Th>Accrues mileage on the trainer</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {COMPONENT_CATEGORIES.map((category) => (
              <CategoryRow
                key={category}
                category={category}
                accruesIndoorMileage={
                  settings.find((setting) => setting.category === category)?.accrues_indoor_mileage ?? true
                }
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
  accruesIndoorMileage,
}: {
  category: string
  accruesIndoorMileage: boolean
}) {
  const updateSetting = useUpdateComponentCategorySetting(category)

  return (
    <Table.Tr>
      <Table.Td>{categoryLabel(category)}</Table.Td>
      <Table.Td>
        <Checkbox
          checked={accruesIndoorMileage}
          onChange={(event) => updateSetting.mutate(event.currentTarget.checked)}
          disabled={updateSetting.isPending}
        />
      </Table.Td>
    </Table.Tr>
  )
}
