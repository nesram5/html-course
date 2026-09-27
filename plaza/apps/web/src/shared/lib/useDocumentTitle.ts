import { useEffect } from 'react';

/** The app name, alone on pages without their own title (and while one is loading). */
export const APP_TITLE = 'Plaza';

/**
 * Sets `document.title` to "`title` · Plaza" while the page is mounted (WCAG 2.4.2: every route
 * has its own title), and back to "Plaza" afterwards. `null` while the title is not known yet.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title === null || title === '' ? APP_TITLE : `${title} · ${APP_TITLE}`;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);
}
