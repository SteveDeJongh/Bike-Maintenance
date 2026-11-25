import type { CSSProperties } from 'react'
import { Button, Group } from '@mantine/core'
import { setupButtonLabel } from './bikeSetupModel'

// Skip for now + Set up N components: the header's and the action bar's
// buttons (the same handlers). `grow` stretches the primary (the phone bar).
export default function SetupActions({
  count,
  submitting,
  onSkip,
  onSubmit,
  grow = false,
  buttonStyle,
}: {
  count: number
  submitting: boolean
  onSkip: () => void
  onSubmit: () => void
  grow?: boolean
  buttonStyle?: CSSProperties
}) {
  return (
    <Group gap="xs" wrap="nowrap" w={grow ? '100%' : undefined}>
      <Button variant="default" onClick={onSkip} style={buttonStyle}>
        Skip for now
      </Button>
      <Button onClick={onSubmit} loading={submitting} disabled={count === 0} style={{ ...buttonStyle, flex: grow ? 1 : undefined }}>
        {setupButtonLabel(count)}
      </Button>
    </Group>
  )
}
