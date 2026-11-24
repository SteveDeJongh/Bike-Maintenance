import { Anchor, Paper, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { Link } from 'react-router-dom'

// Closes the card grid: a dashed card whose main target opens the new-bike
// flow, with a separate link to the Strava gear tab (two targets side by
// side, never one link inside another).
export default function AddBikeCard({ onAdd }: { onAdd: () => void }) {
  return (
    <Paper
      radius="md"
      p="md"
      style={{
        border: '1px dashed var(--mantine-color-default-border)',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 180,
      }}
    >
      <Stack gap={4} align="center">
        <UnstyledButton onClick={onAdd} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <IconPlus size={22} color="var(--mantine-color-dimmed)" />
          <Text fw={600}>Add a bike</Text>
        </UnstyledButton>
        <Anchor component={Link} to="/strava?tab=gear" size="sm">
          Or link one from your Strava gear
        </Anchor>
      </Stack>
    </Paper>
  )
}
