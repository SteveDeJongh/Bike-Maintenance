import { useState } from 'react'
import { Alert, Anchor, Badge, Button, Group, Loader, Table, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useBikes } from '../api/queries'
import { useDeleteBike } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import BikeFormModal from '../components/forms/BikeFormModal'
import type { Bike } from '../types/models'

export default function Bikes() {
  const { data, isPending, isError, error } = useBikes()
  const deleteBike = useDeleteBike()

  const [modalOpened, setModalOpened] = useState(false)
  const [editing, setEditing] = useState<Bike | null>(null)

  function openCreate() {
    setEditing(null)
    setModalOpened(true)
  }

  function openEdit(bike: Bike) {
    setEditing(bike)
    setModalOpened(true)
  }

  function handleDelete(bike: Bike) {
    confirmDelete({
      title: 'Delete bike',
      message: `Delete "${bike.name}"? This also deletes all of its component assignment history.`,
      onConfirm: () => deleteBike.mutate(bike.id),
    })
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Bikes</Title>
        <Button onClick={openCreate}>+ New Bike</Button>
      </Group>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load bikes">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && <Text c="dimmed">No bikes yet.</Text>}

      {data && data.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Make / Model</Table.Th>
              <Table.Th />
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((bike) => (
              <Table.Tr key={bike.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/bikes/${bike.id}`}>
                    {bike.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  {bike.make || bike.model
                    ? [bike.make, bike.model].filter(Boolean).join(' ')
                    : 'Unknown make/model'}
                </Table.Td>
                <Table.Td>
                  {bike.retired_on && <Badge color="gray">Retired</Badge>}
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="subtle" onClick={() => openEdit(bike)}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => handleDelete(bike)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <BikeFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        bike={editing ?? undefined}
      />
    </>
  )
}
