import { AppShell, Group, Anchor, Title } from '@mantine/core'
import { NavLink as RouterNavLink, Outlet } from 'react-router-dom'

const navLinks = [
  { to: '/bikes', label: 'Bikes' },
  { to: '/components', label: 'Components' },
  { to: '/maintenance-events', label: 'Maintenance Events' },
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
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
