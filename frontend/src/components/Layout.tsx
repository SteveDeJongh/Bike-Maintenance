import { useState } from 'react'
import { Anchor, AppShell, Divider, Drawer, Group, Menu, NavLink, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { Link, NavLink as RouterNavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom'
import { IconDots, IconLogout, IconUser } from '@tabler/icons-react'
import EmailVerificationBanner from './EmailVerificationBanner'
import { useCurrentUser } from '../api/queries'
import { useLogout } from '../api/mutations'
import { useSyncCompletionWatcher } from '../hooks/useSyncCompletionWatcher'
import type { NavIcon } from './navDestinations'
import { MORE_DESTINATIONS, NAV_DESTINATIONS, TAB_DESTINATIONS, isDestinationActive } from './navDestinations'

const HEADER_HEIGHT = 56
// The visible tab row is 56px (well over the 44px minimum tap target); the
// iPhone home-indicator inset is added on top via CSS padding, not baked
// into this number, so it's unaffected by which device renders it.
// Responsive height (0 at `sm` and up), not a JS-driven `collapsed` flag --
// Footer's `collapsed` field has no per-breakpoint config the way Navbar's
// does, and driving it from useIsMobile() instead would resolve the
// boundary from a different mechanism than Navbar's own breakpoint CSS,
// which can disagree by a pixel right at 768px (confirmed: briefly showed
// both the sidebar and the tab bar at exactly that width). A responsive
// size object goes through the same breakpoint CSS Navbar's `breakpoint`
// prop does, so the two can never disagree.
const FOOTER_CONTENT_HEIGHT = 56
const FOOTER_HEIGHT = `calc(${FOOTER_CONTENT_HEIGHT}px + env(safe-area-inset-bottom))`

export default function Layout() {
  const location = useLocation()
  const [moreOpened, setMoreOpened] = useState(false)
  const moreActive = MORE_DESTINATIONS.some((d) => isDestinationActive(d, location.pathname))
  // Mounted here, not on any one page, so a Strava sync's completion is
  // noticed (and ride data refreshed) whichever page the user is on.
  useSyncCompletionWatcher()

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: true, desktop: false } }}
      footer={{ height: { base: FOOTER_HEIGHT, sm: 0 } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Anchor component={Link} to="/" underline="never" c="inherit">
            <Title order={3}>Bike Maintenance</Title>
          </Anchor>
          <Group visibleFrom="sm">
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap={4}>
          {NAV_DESTINATIONS.map((destination) => (
            <NavLink
              key={destination.path}
              component={RouterNavLink}
              to={destination.path}
              label={destination.label}
              leftSection={<destination.icon size={18} stroke={1.75} />}
              active={isDestinationActive(destination, location.pathname)}
              variant="light"
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <EmailVerificationBanner />
        <Outlet />
      </AppShell.Main>

      {/* AppShell scrolls the window, so without this a new page opened at
          the previous page's offset. A new navigation starts at the top;
          Back/Forward restores the saved position. Search-param-only
          updates that shouldn't jump pass preventScrollReset (Strava's
          tabs). Pages' own scrollIntoView effects run after its reset. */}
      <ScrollRestoration />

      {/* overflow: hidden -- at `sm` and up the footer's own height resolves
          to 0 (see FOOTER_HEIGHT above), but a 0-height box doesn't clip its
          children by default, so without this the tab labels' intrinsic
          line-height still peeked out below the page on desktop. */}
      <AppShell.Footer style={{ paddingBottom: 'env(safe-area-inset-bottom)', overflow: 'hidden' }}>
        <Group h="100%" grow gap={0} wrap="nowrap">
          {TAB_DESTINATIONS.map((destination) => (
            <TabButton
              key={destination.path}
              label={destination.label}
              icon={destination.icon}
              active={isDestinationActive(destination, location.pathname)}
              to={destination.path}
            />
          ))}
          <TabButton label="More" icon={IconDots} active={moreActive} onClick={() => setMoreOpened(true)} />
        </Group>
      </AppShell.Footer>

      <MoreDrawer opened={moreOpened} onClose={() => setMoreOpened(false)} />
    </AppShell>
  )
}

function TabButton({
  label,
  icon: Icon,
  active,
  to,
  onClick,
}: {
  label: string
  icon: NavIcon
  active: boolean
  to?: string
  onClick?: () => void
}) {
  const content = (
    <Stack align="center" justify="center" gap={2} h="100%">
      <Icon size={22} stroke={1.75} />
      <Text size="10px" c={active ? 'radar' : 'dimmed'} fw={active ? 600 : 400}>
        {label}
      </Text>
    </Stack>
  )

  return to ? (
    <UnstyledButton component={RouterNavLink} to={to} h="100%">
      {content}
    </UnstyledButton>
  ) : (
    <UnstyledButton onClick={onClick} h="100%">
      {content}
    </UnstyledButton>
  )
}

// The mobile-only bottom-sheet home for everything that doesn't fit in the
// tab bar's four fixed slots, plus the user menu's own two actions (moved
// here from UserMenu on mobile -- see Layout's header, which hides UserMenu
// below `sm`).
function MoreDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const logout = useLogout()
  const location = useLocation()

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      title="More"
      styles={{ body: { paddingBottom: 'calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))' } }}
    >
      <Stack gap={0}>
        {MORE_DESTINATIONS.map((destination) => (
          <NavLink
            key={destination.path}
            component={RouterNavLink}
            to={destination.path}
            label={destination.label}
            leftSection={<destination.icon size={20} stroke={1.75} />}
            active={isDestinationActive(destination, location.pathname)}
            onClick={onClose}
            h={48}
          />
        ))}
        <Divider my="xs" />
        <NavLink
          component={RouterNavLink}
          to="/settings/account"
          label="Account settings"
          leftSection={<IconUser size={20} stroke={1.75} />}
          active={location.pathname === '/settings/account'}
          onClick={onClose}
          h={48}
        />
        <NavLink label="Sign out" leftSection={<IconLogout size={20} stroke={1.75} />} onClick={handleLogout} h={48} />
      </Stack>
    </Drawer>
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
        <Menu.Item component={Link} to="/settings/account">
          Account settings
        </Menu.Item>
        <Menu.Item onClick={handleLogout}>Sign out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
