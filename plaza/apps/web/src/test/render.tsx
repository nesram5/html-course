import { render, type RenderResult } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, type RouteObject } from 'react-router';

import { App } from '@/app/App';
import { routes as appRoutes } from '@/app/routes';
import { createI18n } from '@/shared/i18n';

export interface RenderAppOptions {
  /** Initial URL, e.g. `/s/acme`. */
  route?: string;
  routes?: RouteObject[];
}

/** Renders the whole app (providers + router) at a URL, with retries disabled. */
export function renderApp({
  route = '/',
  routes = appRoutes,
}: RenderAppOptions = {}): RenderResult & {
  router: ReturnType<typeof createMemoryRouter>;
} {
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<App router={router} i18n={createI18n()} queryClient={queryClient} />);
  return { ...result, router };
}
