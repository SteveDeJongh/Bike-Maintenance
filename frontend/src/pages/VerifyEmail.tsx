import { useEffect, useRef } from 'react'
import { Alert, Anchor, Center, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { Link, useSearchParams } from 'react-router-dom'
import { useVerifyEmail } from '../api/mutations'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const verifyEmail = useVerifyEmail()
  const attempted = useRef(false)

  useEffect(() => {
    if (token && !attempted.current) {
      attempted.current = true
      verifyEmail.mutate(token)
    }
  }, [token, verifyEmail])

  return (
    <Center mih="100vh">
      <Paper withBorder shadow="sm" p="xl" maw={400} w="100%">
        <Stack align="center">
          <Title order={2}>Verify email</Title>

          {!token && <Alert color="red">This link is missing its verification token.</Alert>}
          {token && verifyEmail.isPending && <Loader />}
          {token && verifyEmail.isSuccess && <Text>Your email is verified.</Text>}
          {token && verifyEmail.isError && (
            <Alert color="red">That verification link is invalid or has expired.</Alert>
          )}

          <Anchor component={Link} to="/">Go to the app</Anchor>
        </Stack>
      </Paper>
    </Center>
  )
}
