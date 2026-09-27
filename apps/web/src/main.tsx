import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';

import { App } from './app/App';
import { createQueryClient } from './app/query-client';
import { routes } from './app/routes';
import { createI18n } from './shared/i18n';
import { initSentry } from './shared/lib/sentry';
import './index.css';

void initSentry();

const i18n = createI18n();
const queryClient = createQueryClient(i18n);
const router = createBrowserRouter(routes);

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App router={router} i18n={i18n} queryClient={queryClient} />
  </StrictMode>,
);
