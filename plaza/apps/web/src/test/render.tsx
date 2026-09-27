import { render, type RenderResult } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, type RouteObject } from 'react-router';

import { App } from '@/app/App';
import { routes as appRoutes } from '@/app/routes';
import type { SpaceExtension } from '@/features/world';
import { createI18n } from '@/shared/i18n';

export interface RenderAppOptions {
  /** Initial URL, e.g. `/s/acme`. */
  route?: string;
  routes?: RouteObject[];
  /**
   * Extensions of the office page. None by default, so each feature is tested on its own (the
   * media pre-join would otherwise stand before every office test); pass the app's list, or
   * some of them, to test them in the page.
   */
  spaceExtensions?: readonly SpaceExtension[];
}

/** Renders the whole app (providers + router) at a URL, with retries disabled. */
export function renderApp({
  route = '/',
  routes = appRoutes,
  spaceExtensions = [],
}: RenderAppOptions = {}): RenderResult & {
  router: ReturnType<typeof createMemoryRouter>;
} {
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <App
      router={router}
      i18n={createI18n()}
      queryClient={queryClient}
      spaceExtensions={spaceExtensions}
    />,
  );
  return { ...result, router };
}
