import { useState } from 'react'
import {
  Alert, Badge, Button, Divider, Group, Loader, Stack, Text, TextInput, PasswordInput, Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../../api/client'
import { applyApiErrors, formatApiError } from '../../api/errors'
import { useCurrentUser } from '../../api/queries'
import {
  useDeleteAccount, useResendVerification, useUnlinkIdentity, useUpdateMe, useUpdateMyPassword,
} from '../../api/mutations'
import { confirmDelete } from '../../components/confirmDelete'
import type { User } from '../../types/models'

export default function AccountPage() {
  const { data: user, isPending, isError, error } = useCurrentUser()

  return (
    <Stack maw={480}>
      <Title order={3}>Account</Title>

      {isPending && <Loader />}
      {isError && (
        <Alert color="red" title="Failed to load account">
          {error.message}
        </Alert>
      )}

      {user && (
        <>
          <ProfileSection user={user} />
          <Divider />
          <PasswordSection user={user} />
          <Divider />
          <SignInMethodsSection user={user} />
          <Divider />
          <DangerZoneSection user={user} />
        </>
      )}
    </Stack>
  )
}

function ProfileSection({ user }: { user: User }) {
  const updateMe = useUpdateMe()
  const resend = useResendVerification()
  const [resent, setResent] = useState(false)
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const form = useForm({
    initialValues: { name: user.name, email: user.email ?? '' },
    validate: {
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  })

  function handleSubmit(values: { name: string; email: string }) {
    setBaseErrors([])
    updateMe.mutate(
      { name: values.name, email: values.email.trim() || undefined },
      { onError: (err) => setBaseErrors(applyApiErrors(form, err)) },
    )
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <Title order={4}>Profile</Title>

        {baseErrors.length > 0 && (
          <Alert color="red">
            {baseErrors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Alert>
        )}

        <TextInput label="Name" required {...form.getInputProps('name')} />
        <TextInput label="Email" type="email" {...form.getInputProps('email')} />

        {user.email && (
          <Group gap="xs">
            <Badge color={user.email_verified ? 'teal' : 'yellow'}>
              {user.email_verified ? 'Verified' : 'Unverified'}
            </Badge>
            {!user.email_verified && (
              <Button
                size="xs"
                variant="subtle"
                disabled={resent}
                loading={resend.isPending}
                onClick={() => resend.mutate(undefined, { onSuccess: () => setResent(true) })}
              >
                {resent ? 'Sent' : 'Resend verification'}
              </Button>
            )}
          </Group>
        )}

        <Button type="submit" loading={updateMe.isPending} style={{ alignSelf: 'flex-start' }}>
          Save
        </Button>
      </Stack>
    </form>
  )
}

function PasswordSection({ user }: { user: User }) {
  const updatePassword = useUpdateMyPassword()
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  const form = useForm({
    initialValues: { current_password: '', password: '' },
    validate: {
      password: (value) => (value.length >= 8 ? null : 'Password must be at least 8 characters'),
    },
  })

  function handleSubmit(values: { current_password: string; password: string }) {
    setBaseErrors([])
    setSaved(false)
    updatePassword.mutate(
      { current_password: user.has_password ? values.current_password : undefined, password: values.password },
      {
        onSuccess: () => {
          setSaved(true)
          form.reset()
        },
        onError: (err) => setBaseErrors(applyApiErrors(form, err)),
      },
    )
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <Title order={4}>{user.has_password ? 'Change password' : 'Set a password'}</Title>

        {baseErrors.length > 0 && (
          <Alert color="red">
            {baseErrors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Alert>
        )}
        {saved && <Alert color="teal">Password saved.</Alert>}

        {user.has_password && (
          <PasswordInput label="Current password" required {...form.getInputProps('current_password')} />
        )}
        <PasswordInput label="New password" required {...form.getInputProps('password')} />

        <Button type="submit" loading={updatePassword.isPending} style={{ alignSelf: 'flex-start' }}>
          Save
        </Button>
      </Stack>
    </form>
  )
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  strava: 'Strava',
}

function SignInMethodsSection({ user }: { user: User }) {
  const unlink = useUnlinkIdentity()
  const signInMethodCount = user.identities.length + (user.has_password ? 1 : 0)
  const stravaLinked = user.identities.some((identity) => identity.provider === 'strava')

  return (
    <Stack>
      <Title order={4}>Sign-in methods</Title>

      {user.identities.map((identity) => (
        <Group key={identity.provider} justify="space-between">
          <Text>{PROVIDER_LABELS[identity.provider] ?? identity.provider}</Text>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            disabled={signInMethodCount <= 1}
            loading={unlink.isPending && unlink.variables === identity.provider}
            onClick={() => unlink.mutate(identity.provider)}
          >
            Unlink
          </Button>
        </Group>
      ))}

      {!stravaLinked && (
        <Group justify="space-between">
          <Text>Strava</Text>
          <Button size="xs" variant="default" component="a" href={`${API_BASE_URL}/auth/strava`}>
            Link
          </Button>
        </Group>
      )}

      {unlink.isError && <Text c="red" size="sm">{formatApiError(unlink.error)}</Text>}
    </Stack>
  )
}

function DangerZoneSection({ user }: { user: User }) {
  const deleteAccount = useDeleteAccount()
  const navigate = useNavigate()

  function afterDelete() {
    navigate('/login', { replace: true })
  }

  function handleDelete() {
    if (!user.has_password) {
      confirmDelete({
        title: 'Delete account',
        message: 'This permanently deletes your account and everything in it. This cannot be undone.',
        onConfirm: () => deleteAccount.mutate(undefined, { onSuccess: afterDelete }),
      })
      return
    }

    modals.open({
      title: 'Delete account',
      children: <DeleteAccountForm onConfirm={(password) => deleteAccount.mutate(password, { onSuccess: afterDelete })} />,
    })
  }

  return (
    <Stack>
      <Title order={4}>Delete account</Title>
      <Text size="sm" c="dimmed">
        Permanently deletes your account and everything it owns. This cannot be undone.
      </Text>
      <Button color="red" variant="outline" style={{ alignSelf: 'flex-start' }} onClick={handleDelete}>
        Delete account
      </Button>
    </Stack>
  )
}

function DeleteAccountForm({ onConfirm }: { onConfirm: (password: string) => void }) {
  const [password, setPassword] = useState('')

  function handleSubmit() {
    onConfirm(password)
    modals.closeAll()
  }

  return (
    <Stack>
      <Text size="sm">Enter your password to permanently delete your account.</Text>
      <PasswordInput label="Password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
      <Group justify="flex-end">
        <Button variant="default" onClick={() => modals.closeAll()}>
          Cancel
        </Button>
        <Button color="red" disabled={!password} onClick={handleSubmit}>
          Delete account
        </Button>
      </Group>
    </Stack>
  )
}
