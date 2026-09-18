import { createBrowserRouter } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Bikes from './pages/Bikes'
import Components from './pages/Components'
import MaintenanceEvents from './pages/MaintenanceEvents'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Landing /> },
      { path: 'bikes', element: <Bikes /> },
      { path: 'components', element: <Components /> },
      { path: 'maintenance-events', element: <MaintenanceEvents /> },
    ],
  },
])
