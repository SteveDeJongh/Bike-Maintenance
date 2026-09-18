import { createBrowserRouter } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Bikes from './pages/Bikes'
import BikeDetail from './pages/BikeDetail'
import Components from './pages/Components'
import ComponentDetail from './pages/ComponentDetail'
import Assignments from './pages/Assignments'
import MaintenanceEvents from './pages/MaintenanceEvents'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Landing /> },
      { path: 'bikes', element: <Bikes /> },
      { path: 'bikes/:id', element: <BikeDetail /> },
      { path: 'components', element: <Components /> },
      { path: 'components/:id', element: <ComponentDetail /> },
      { path: 'assignments', element: <Assignments /> },
      { path: 'maintenance-events', element: <MaintenanceEvents /> },
    ],
  },
])
