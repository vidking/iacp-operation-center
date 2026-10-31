import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Outlet } from '@tanstack/react-router';
import { AppShell } from './app/components';
import { ConnectorsPage, HomeRedirect, LoginPage, ModulePage, OverviewPage } from './app/pages';

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
  component: () => <ModulePage module="instances" />,
});
const provisioningRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'provisioning',
  component: () => <ModulePage module="provisioning" />,
});
const operationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'operations',
  component: () => <ModulePage module="operations" />,
});
const eventsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'events',
  component: () => <ModulePage module="events" />,
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
