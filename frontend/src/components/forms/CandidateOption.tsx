import { Stack, Text } from '@mantine/core'

// One option in a swap/replace Select: the label, with useSwapCandidates'
// caption under it.
export default function CandidateOption({ label, caption }: { label: string; caption?: string }) {
  return (
    <Stack gap={0}>
      <Text size="sm">{label}</Text>
      {caption && (
        <Text size="xs" c="dimmed">
          {caption}
        </Text>
      )}
    </Stack>
  )
}
