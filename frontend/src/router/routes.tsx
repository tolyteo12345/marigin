import { createBrowserRouter, redirect, type RouteObject } from 'react-router';
import { AppShell } from '../components/layout/AppShell';
import { BinanceConnectionsPage } from '../components/binance/BinanceConnectionsPage';
import { AccountPage } from '../pages/AccountPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { LoadingShell } from './LoadingShell';
import { requireSession } from './requireSession';
import { panelClassName } from '../styles';

// Exported separately from `router` so tests can build a createMemoryRouter
// from the exact same route tree instead of re-declaring it (COND-N02).
export const routeConfig: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    id: 'protected',
    loader: requireSession,
    HydrateFallback: LoadingShell,
    element: <AppShell />,
    children: [
      { index: true, loader: () => redirect('/account') },
      { path: 'account', element: <AccountPage /> },
      {
        path: 'connections/binance',
        element: (
          <section className={panelClassName}>
            <BinanceConnectionsPage />
          </section>
        ),
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routeConfig);
