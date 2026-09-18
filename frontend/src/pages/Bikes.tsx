import { Alert, Badge, Group, Loader, Table, Text, Title } from '@mantine/core'
import { useBikes } from '../api/queries'

export default function Bikes() {
  const { data, isPending, isError, error } = useBikes()

  return (
    <>
      <Title order={2} mb="md">
        Bikes
      </Title>

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
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((bike) => (
              <Table.Tr key={bike.id}>
                <Table.Td>{bike.name}</Table.Td>
                <Table.Td>
                  {bike.make || bike.model
                    ? [bike.make, bike.model].filter(Boolean).join(' ')
                    : 'Unknown make/model'}
                </Table.Td>
                <Table.Td>
                  {bike.retired_on && (
                    <Group justify="flex-end">
                      <Badge color="gray">Retired</Badge>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  )
}
