import { useState } from 'react'
import { Alert, Button, Group, Loader, MultiSelect, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useBikeTypes } from '../../api/queries'
import { useCreateBikeType, useDeleteBikeType, useUpdateBikeType } from '../../api/mutations'
import { confirmDelete } from '../../components/confirmDelete'
import { parseApiError } from '../../api/errors'
import { categoryLabel } from '../../constants'
import { useAllCategories } from '../../hooks/useAllCategories'
import type { BikeType } from '../../types/models'

export default function BikeTypesPage() {
  const { data: bikeTypes, isPending, isError, error } = useBikeTypes()
  const allCategories = useAllCategories()
  const categoryOptions = allCategories.map((category) => ({ value: category, label: categoryLabel(category) }))

  const [newName, setNewName] = useState('')
  const [newCategories, setNewCategories] = useState<string[]>([])
  const createBikeType = useCreateBikeType()

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    createBikeType.mutate(
      { name, default_categories: newCategories },
      {
        onSuccess: () => {
          setNewName('')
          setNewCategories([])
        },
      },
    )
  }

  return (
    <Stack>
      <Title order={3}>Bike Types</Title>
      <Text c="dimmed">
        Presets like Road or Mountain, pre-checking their usual categories when setting up a new
        bike's components. Editing a type's categories, or changing which type a bike uses, never
        changes any bike's already-tracked components.
      </Text>

      {isPending && <Loader />}
      {isError && (
        <Alert color="red" title="Failed to load bike types">
          {error.message}
        </Alert>
      )}

      {bikeTypes && (
        <Table>
          <Table.Tbody>
            {bikeTypes.map((bikeType) => (
              <BikeTypeRow key={bikeType.id} bikeType={bikeType} categoryOptions={categoryOptions} />
            ))}
            <Table.Tr>
              <Table.Td>
                <TextInput
                  placeholder="New bike type name"
                  value={newName}
                  onChange={(event) => setNewName(event.currentTarget.value)}
                  disabled={createBikeType.isPending}
                />
              </Table.Td>
              <Table.Td>
                <MultiSelect
                  placeholder="Default categories"
                  data={categoryOptions}
                  value={newCategories}
                  onChange={setNewCategories}
                  disabled={createBikeType.isPending}
                  searchable
                />
              </Table.Td>
              <Table.Td>
                <Button
                  size="sm"
                  variant="default"
                  disabled={!newName.trim() || createBikeType.isPending}
                  onClick={handleCreate}
                >
                  Add
                </Button>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}

      {createBikeType.isError && (
        <Alert color="red">{parseApiError(createBikeType.error).baseErrors.join(', ')}</Alert>
      )}
    </Stack>
  )
}

function BikeTypeRow({
  bikeType,
  categoryOptions,
}: {
  bikeType: BikeType
  categoryOptions: { value: string; label: string }[]
}) {
  const [name, setName] = useState(bikeType.name)
  const [categories, setCategories] = useState(bikeType.default_categories)
  const updateBikeType = useUpdateBikeType(bikeType.id)
  const deleteBikeType = useDeleteBikeType()

  const dirty =
    name.trim() !== bikeType.name ||
    JSON.stringify([...categories].sort()) !== JSON.stringify([...bikeType.default_categories].sort())

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    updateBikeType.mutate({ name: trimmed, default_categories: categories })
  }

  function handleDelete() {
    confirmDelete({
      title: 'Delete bike type',
      message: `Delete "${bikeType.name}"? Any bike using it keeps its components, just without this type.`,
      onConfirm: () => deleteBikeType.mutate(bikeType.id),
    })
  }

  const deleteError = deleteBikeType.isError ? parseApiError(deleteBikeType.error).baseErrors.join(', ') : null

  return (
    <Table.Tr>
      <Table.Td>
        <TextInput value={name} onChange={(event) => setName(event.currentTarget.value)} />
      </Table.Td>
      <Table.Td>
        <MultiSelect data={categoryOptions} value={categories} onChange={setCategories} searchable />
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="default" disabled={!dirty} loading={updateBikeType.isPending} onClick={handleSave}>
            Save
          </Button>
          <Button size="xs" variant="subtle" color="red" loading={deleteBikeType.isPending} onClick={handleDelete}>
            Delete
          </Button>
        </Group>
        {deleteError && (
          <Text c="red" size="xs" mt={4}>
            {deleteError}
          </Text>
        )}
      </Table.Td>
    </Table.Tr>
  )
}
