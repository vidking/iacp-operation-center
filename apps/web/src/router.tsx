import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Outlet } from '@tanstack/react-router';
import { AppShell } from './app/components';
import {
  ConnectorsPage,
  EventsPage,
  HomeRedirect,
  IncidentsPage,
  InstancesPage,
  LoginPage,
  OperationsPage,
  OverviewPage,
  ProvisioningPage,
  SettingsPage,
  UsersPage,
  WorkersPage,
} from './app/pages';

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRedirect,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppShell,
});

const overviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'overview',
  component: OverviewPage,
});
const instancesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'instances',
  component: InstancesPage,
});
const provisioningRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'provisioning',
  component: ProvisioningPage,
});
const operationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'operations',
  component: OperationsPage,
});
const eventsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'events',
  component: EventsPage,
});
const workersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'workers',
  component: WorkersPage,
});
const incidentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'incidents',
  component: IncidentsPage,
});
const connectorsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'connectors',
  component: ConnectorsPage,
});
const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'users',
  component: UsersPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  appRoute.addChildren([
    overviewRoute,
    instancesRoute,
    provisioningRoute,
    operationsRoute,
    eventsRoute,
    workersRoute,
    incidentsRoute,
    connectorsRoute,
    usersRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
