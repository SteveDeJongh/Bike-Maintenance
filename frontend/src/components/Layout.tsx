import { AppShell, Group, Anchor, Menu, Title, UnstyledButton } from '@mantine/core'
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom'
import MaintenanceAlertBanners from './MaintenanceAlertBanners'
import { useCurrentUser } from '../api/queries'
import { useLogout } from '../api/mutations'

const navLinks = [
  { to: '/bikes', label: 'Bikes' },
  { to: '/components', label: 'Components' },
  { to: '/maintenance-events', label: 'Maintenance Events' },
  { to: '/assignments', label: 'Assignments' },
  { to: '/strava', label: 'Strava' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Anchor component={RouterNavLink} to="/" underline="never">
            <Title order={3}>Bike Maintenance</Title>
          </Anchor>
          <Group gap="lg">
            {navLinks.map((link) => (
              <Anchor key={link.to} component={RouterNavLink} to={link.to}>
                {link.label}
              </Anchor>
            ))}
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <MaintenanceAlertBanners />
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}

function UserMenu() {
  // RequireAuth already guarantees a signed-in user by the time Layout
  // renders, so this is always populated (cached from the same /me query).
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <UnstyledButton>{user?.name}</UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={handleLogout}>Sign out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
