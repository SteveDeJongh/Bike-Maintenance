import { Box, Group, Stack, Anchor, Title } from '@mantine/core'
import { NavLink as RouterNavLink, Outlet } from 'react-router-dom'
import { useIsMobile } from '../../hooks/useIsMobile'

const settingsNavLinks = [
  { to: '/settings/component-categories', label: 'Component Categories' },
  { to: '/settings/service-types', label: 'Service Types' },
  { to: '/settings/bike-types', label: 'Bike Types' },
  { to: '/settings/notifications', label: 'Notifications' },
  { to: '/settings/appearance', label: 'Appearance' },
  { to: '/settings/account', label: 'Account' },
]

export default function SettingsLayout() {
  // Below `sm` the fixed-width vertical sidebar next to the content would
  // force the page wider than the viewport -- swap it for a horizontally
  // scrollable row above the content instead of letting it overflow.
  const isMobile = useIsMobile()

  return (
    <Stack>
      <Title order={2}>Settings</Title>
      <Group align="flex-start" gap={isMobile ? 'md' : 'xl'} wrap={isMobile ? 'wrap' : 'nowrap'}>
        {isMobile ? (
          <Group gap="md" wrap="nowrap" style={{ overflowX: 'auto', width: '100%' }} pb={4}>
            {settingsNavLinks.map((link) => (
              <Anchor key={link.to} component={RouterNavLink} to={link.to} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                {link.label}
              </Anchor>
            ))}
          </Group>
        ) : (
          <Stack w={200} gap="xs">
            {settingsNavLinks.map((link) => (
              <Anchor key={link.to} component={RouterNavLink} to={link.to}>
                {link.label}
              </Anchor>
            ))}
          </Stack>
        )}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </Box>
      </Group>
    </Stack>
  )
}
