import { useEffect } from 'react'
import { Center, Loader } from '@mantine/core'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCurrentUser } from '../api/queries'
import { setUnauthorizedHandler } from '../api/client'
import { queryClient } from '../api/queryClient'

export default function RequireAuth() {
  const { data: user, isPending, isError } = useCurrentUser()
  const location = useLocation()
  const navigate = useNavigate()

  // Registered once per mount of the authenticated tree -- any request
  // anywhere that comes back 401 (session expired, signed out in another
  // tab) routes back here the same way an initial unauthenticated load does.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear()
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true })
    })
    return () => setUnauthorizedHandler(null)
  }, [navigate, location.pathname])

  if (isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (isError || !user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }

  return <Outlet />
}
