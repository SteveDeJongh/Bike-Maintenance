import { useState } from 'react'
import { Alert, Anchor, Button, Center, Paper, Stack, Text, TextInput, PasswordInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link, useNavigate } from 'react-router-dom'
import { applyApiErrors } from '../api/errors'
import { useRegister } from '../api/mutations'

interface RegisterFormValues {
  name: string
  email: string
  password: string
}

export default function Register() {
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const navigate = useNavigate()
  const register = useRegister()

  const form = useForm<RegisterFormValues>({
    initialValues: { name: '', email: '', password: '' },
    validate: {
      name: (value) => (value.trim() ? null : 'Name is required'),
      email: (value) => (value.trim() ? null : 'Email is required'),
      password: (value) => (value.length >= 8 ? null : 'Password must be at least 8 characters'),
    },
  })

  function handleSubmit(values: RegisterFormValues) {
    setBaseErrors([])
    register.mutate(values, {
      onSuccess: () => navigate('/', { replace: true }),
      onError: (error) => setBaseErrors(applyApiErrors(form, error)),
    })
  }

  return (
    <Center mih="100vh">
      <Paper withBorder shadow="sm" p="xl" maw={400} w="100%">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <Title order={2}>Create an account</Title>

            {baseErrors.length > 0 && (
              <Alert color="red">
                {baseErrors.map((message) => (
                  <div key={message}>{message}</div>
                ))}
              </Alert>
            )}

            <TextInput label="Name" required {...form.getInputProps('name')} />
            <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
            <PasswordInput label="Password" required {...form.getInputProps('password')} />

            <Button type="submit" loading={register.isPending}>
              Register
            </Button>

            <Text size="sm" ta="center">
              Already have an account? <Anchor component={Link} to="/login">Sign in</Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
