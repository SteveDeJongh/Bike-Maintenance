import { useState } from 'react'
import { Anchor, Button, Center, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link } from 'react-router-dom'
import { useForgotPassword } from '../api/mutations'

interface ForgotPasswordFormValues {
  email: string
}

export default function ForgotPassword() {
  const [submitted, setSubmitted] = useState(false)
  const forgotPassword = useForgotPassword()

  const form = useForm<ForgotPasswordFormValues>({
    initialValues: { email: '' },
    validate: {
      email: (value) => (value.trim() ? null : 'Email is required'),
    },
  })

  function handleSubmit(values: ForgotPasswordFormValues) {
    // Always shows the same confirmation, whether or not that email has an
    // account -- the API itself never reveals that either.
    forgotPassword.mutate(values.email, { onSettled: () => setSubmitted(true) })
  }

  return (
    <Center mih="100vh">
      <Paper withBorder shadow="sm" p="xl" maw={400} w="100%">
        <Stack>
          <Title order={2}>Forgot password</Title>

          {submitted ? (
            <Text>If that email has an account, we&apos;ve sent a link to reset your password.</Text>
          ) : (
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack>
                <Text c="dimmed" size="sm">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </Text>
                <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
                <Button type="submit" loading={forgotPassword.isPending}>
                  Send reset link
                </Button>
              </Stack>
            </form>
          )}

          <Text size="sm" ta="center">
            <Anchor component={Link} to="/login">Back to sign in</Anchor>
          </Text>
        </Stack>
      </Paper>
    </Center>
  )
}
