import { Stack, Text } from '@mantine/core'

// One option in a swap/replace list: the label, a dimmed brand/model, and
// a dimmed status line ("Last on X", "Never installed", "Also on X (indoor)").
export default function CandidateOption({ label, brandModel, status }: { label: string; brandModel?: string | null; status?: string }) {
  return (
    <Stack gap={0}>
      <Text size="sm">{label}</Text>
      {brandModel && (
        <Text size="xs" c="dimmed">
          {brandModel}
        </Text>
      )}
      {status && (
        <Text size="xs" c="dimmed">
          {status}
        </Text>
      )}
    </Stack>
  )
}
