import { useState } from 'react'
import { Alert, Button, Group, Text } from '@mantine/core'
import { useCurrentUser } from '../api/queries'
import { useResendVerification } from '../api/mutations'

// Styled like MaintenanceAlertBanners' own warning banner -- same yellow
// Alert, same "it's not blocking, just worth noticing" tone.
export default function EmailVerificationBanner() {
  const { data: user } = useCurrentUser()
  const resend = useResendVerification()
  const [sent, setSent] = useState(false)

  if (!user || user.email_verified || !user.email) return null

  return (
    <Alert color="yellow" mb="md">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">Verify your email address ({user.email}) to secure your account.</Text>
        <Button
          size="xs"
          variant="subtle"
          loading={resend.isPending}
          disabled={sent}
          onClick={() => resend.mutate(undefined, { onSuccess: () => setSent(true) })}
        >
          {sent ? 'Sent' : 'Resend email'}
        </Button>
      </Group>
    </Alert>
  )
}
