import { useState } from 'react'
import { Alert, Anchor, Button, Center, Paper, Stack, Text, PasswordInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { applyApiErrors } from '../api/errors'
import { useResetPassword } from '../api/mutations'

interface ResetPasswordFormValues {
  password: string
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const navigate = useNavigate()
  const resetPassword = useResetPassword()

  const form = useForm<ResetPasswordFormValues>({
    initialValues: { password: '' },
    validate: {
      password: (value) => (value.length >= 8 ? null : 'Password must be at least 8 characters'),
    },
  })

  function handleSubmit(values: ResetPasswordFormValues) {
    if (!token) return
    setBaseErrors([])
    resetPassword.mutate(
      { token, password: values.password },
      {
        onSuccess: () => navigate('/', { replace: true }),
        onError: (error) => setBaseErrors(applyApiErrors(form, error)),
      },
    )
  }

  return (
    <Center mih="100vh">
      <Paper withBorder shadow="sm" p="xl" maw={400} w="100%">
        <Stack>
          <Title order={2}>Reset password</Title>

          {!token ? (
            <Alert color="red">This link is missing its reset token. Request a new one below.</Alert>
          ) : (
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack>
                {baseErrors.length > 0 && (
                  <Alert color="red">
                    {baseErrors.map((message) => (
                      <div key={message}>{message}</div>
                    ))}
                  </Alert>
                )}
                <PasswordInput label="New password" required {...form.getInputProps('password')} />
                <Button type="submit" loading={resetPassword.isPending}>
                  Reset password
                </Button>
              </Stack>
            </form>
          )}

          <Text size="sm" ta="center">
            <Anchor component={Link} to="/forgot-password">Request a new link</Anchor>
          </Text>
        </Stack>
      </Paper>
    </Center>
  )
}
