import { Box, Group, Stack, Anchor, Title } from '@mantine/core'
import { NavLink as RouterNavLink, Outlet } from 'react-router-dom'

const settingsNavLinks = [
  { to: '/settings/component-categories', label: 'Component Categories' },
  { to: '/settings/service-types', label: 'Service Types' },
  { to: '/settings/notifications', label: 'Notifications' },
]

export default function SettingsLayout() {
  return (
    <Stack>
      <Title order={2}>Settings</Title>
      <Group align="flex-start" gap="xl" wrap="nowrap">
        <Stack w={200} gap="xs">
          {settingsNavLinks.map((link) => (
            <Anchor key={link.to} component={RouterNavLink} to={link.to}>
              {link.label}
            </Anchor>
          ))}
        </Stack>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </Box>
      </Group>
    </Stack>
  )
}
