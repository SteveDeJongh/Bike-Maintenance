import { Card, SimpleGrid, Text, Title, Stack } from '@mantine/core'
import { Link } from 'react-router-dom'

const sections = [
  {
    to: '/bikes',
    title: 'Bikes',
    description: 'View your bikes.',
  },
  {
    to: '/components',
    title: 'Components',
    description: 'View chains, cassettes, tires, and other tracked components.',
  },
  {
    to: '/maintenance-events',
    title: 'Maintenance Events',
    description: 'View the latest waxing, cleaning, and other maintenance events.',
  },
]

export default function Landing() {
  return (
    <Stack gap="xl">
      <div>
        <Title order={1}>Bike Maintenance Tracker</Title>
        <Text c="dimmed">
          Track wear on your bike components and log maintenance events.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {sections.map((section) => (
          <Card
            key={section.to}
            component={Link}
            to={section.to}
            withBorder
            padding="lg"
            radius="md"
          >
            <Title order={3}>{section.title}</Title>
            <Text c="dimmed" size="sm">
              {section.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
