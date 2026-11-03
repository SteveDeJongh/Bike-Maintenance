import { SegmentedControl, Stack, Text, Title, useMantineColorScheme } from '@mantine/core'

const OPTIONS = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'auto' },
]

export default function AppearancePage() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()

  return (
    <Stack maw={360}>
      <Title order={3}>Appearance</Title>
      <Text c="dimmed">
        Choose a light or dark theme, or follow your system setting. Applies immediately and is
        remembered on this device.
      </Text>
      <SegmentedControl
        value={colorScheme}
        onChange={(value) => setColorScheme(value as 'light' | 'dark' | 'auto')}
        data={OPTIONS}
      />
    </Stack>
  )
}
