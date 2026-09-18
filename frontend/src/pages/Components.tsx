import { Alert, Loader, Table, Text, Title } from '@mantine/core'
import { useComponents } from '../api/queries'

export default function Components() {
  const { data, isPending, isError, error } = useComponents()

  return (
    <>
      <Title order={2} mb="md">
        Components
      </Title>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load components">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && <Text c="dimmed">No components yet.</Text>}

      {data && data.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Label</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Acquired</Table.Th>
              <Table.Th>Retired</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((component) => (
              <Table.Tr key={component.id}>
                <Table.Td>{component.label}</Table.Td>
                <Table.Td>{component.category}</Table.Td>
                <Table.Td>{component.acquired_on}</Table.Td>
                <Table.Td>{component.retired_on ?? 'Active'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  )
}
