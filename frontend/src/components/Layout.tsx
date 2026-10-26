import { AppShell, Group, Anchor, Title } from '@mantine/core'
import { NavLink as RouterNavLink, Outlet } from 'react-router-dom'
import MaintenanceAlertBanners from './MaintenanceAlertBanners'

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
