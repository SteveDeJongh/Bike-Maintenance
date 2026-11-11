import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import Activity from './pages/Activity'
import Bikes from './pages/Bikes'
import BikeDetail from './pages/BikeDetail'
import BikeSetup from './pages/BikeSetup'
import Components from './pages/Components'
import ComponentDetail from './pages/ComponentDetail'
import Assignments from './pages/Assignments'
import MaintenanceEvents from './pages/MaintenanceEvents'
import Strava from './pages/Strava'
import SettingsLayout from './pages/settings/SettingsLayout'
import ComponentCategorySettingsPage from './pages/settings/ComponentCategorySettingsPage'
import ServiceTypesPage from './pages/settings/ServiceTypesPage'
import BikeTypesPage from './pages/settings/BikeTypesPage'
import NotificationsPage from './pages/settings/NotificationsPage'
import AppearancePage from './pages/settings/AppearancePage'
import AccountPage from './pages/settings/AccountPage'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <Layout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'activity', element: <Activity /> },
          { path: 'bikes', element: <Bikes /> },
          { path: 'bikes/:id', element: <BikeDetail /> },
          { path: 'bikes/:id/setup', element: <BikeSetup /> },
          { path: 'components', element: <Components /> },
          { path: 'components/:id', element: <ComponentDetail /> },
          { path: 'assignments', element: <Assignments /> },
          { path: 'maintenance-events', element: <MaintenanceEvents /> },
          { path: 'strava', element: <Strava /> },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="component-categories" replace /> },
              { path: 'component-categories', element: <ComponentCategorySettingsPage /> },
              { path: 'service-types', element: <ServiceTypesPage /> },
              { path: 'bike-types', element: <BikeTypesPage /> },
              { path: 'notifications', element: <NotificationsPage /> },
              { path: 'appearance', element: <AppearancePage /> },
              { path: 'account', element: <AccountPage /> },
            ],
          },
        ],
      },
    ],
  },
])
