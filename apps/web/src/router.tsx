import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Outlet } from '@tanstack/react-router';
import { AppShell } from './app/components';
import {
  ConnectorsPage,
  EventsPage,
  HomeRedirect,
  InstancesPage,
  LoginPage,
  ModulePage,
  OperationsPage,
  OverviewPage,
  ProvisioningPage,
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
  component: () => <ModulePage module="workers" />,
});
const incidentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'incidents',
  component: () => <ModulePage module="incidents" />,
});
const connectorsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'connectors',
  component: ConnectorsPage,
});
const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'users',
  component: () => <ModulePage module="users" />,
});
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'settings',
  component: () => <ModulePage module="settings" />,
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
