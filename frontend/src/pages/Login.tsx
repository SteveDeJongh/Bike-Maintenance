import { useState } from 'react'
import { Alert, Anchor, Button, Center, Divider, Paper, Stack, Text, TextInput, PasswordInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../api/client'
import { applyApiErrors } from '../api/errors'
import { useLogin } from '../api/mutations'

interface LoginFormValues {
  email: string
  password: string
}

// Maps the OAuth callback's own ?error= codes (see StravaController and,
// later, Auth::OmniauthCallbacksController) to a readable message -- an
// unrecognized code still shows something rather than nothing.
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'That sign-in attempt could not be verified. Please try again.',
  exchange_failed: 'Something went wrong completing sign-in. Please try again.',
  athlete_already_linked: 'That Strava account is already linked to a different account.',
  access_denied: 'Sign-in was cancelled.',
}

export default function Login() {
  const [searchParams] = useSearchParams()
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const navigate = useNavigate()
  const login = useLogin()

  const oauthError = searchParams.get('error')
  const next = searchParams.get('next') || '/'

  const form = useForm<LoginFormValues>({
    initialValues: { email: '', password: '' },
    validate: {
      email: (value) => (value.trim() ? null : 'Email is required'),
      password: (value) => (value ? null : 'Password is required'),
    },
  })

  function handleSubmit(values: LoginFormValues) {
    setBaseErrors([])
    login.mutate(values, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: (error) => setBaseErrors(applyApiErrors(form, error)),
    })
  }

  return (
    <Center mih="100vh">
      <Paper withBorder shadow="sm" p="xl" maw={400} w="100%">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <Title order={2}>Sign in</Title>

            {oauthError && (
              <Alert color="red">{OAUTH_ERROR_MESSAGES[oauthError] ?? 'Sign-in failed. Please try again.'}</Alert>
            )}
            {baseErrors.length > 0 && (
              <Alert color="red">
                {baseErrors.map((message) => (
                  <div key={message}>{message}</div>
                ))}
              </Alert>
            )}

            <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
            <PasswordInput label="Password" required {...form.getInputProps('password')} />

            <Button type="submit" loading={login.isPending}>
              Sign in
            </Button>

            <Divider label="or" labelPosition="center" />

            <Button component="a" href={`${API_BASE_URL}/auth/strava`} variant="default">
              Continue with Strava
            </Button>

            <Text size="sm" ta="center">
              Don&apos;t have an account? <Anchor component={Link} to="/register">Register</Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
