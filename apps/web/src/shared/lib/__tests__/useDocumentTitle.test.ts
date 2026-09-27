import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDocumentTitle } from '../useDocumentTitle';

describe('useDocumentTitle (WCAG 2.4.2)', () => {
  it('names the page, and goes back to "Bululu" when it unmounts', () => {
    const { rerender, unmount } = renderHook(
      ({ title }) => {
        useDocumentTitle(title);
      },
      { initialProps: { title: null as string | null } },
    );
    expect(document.title).toBe('Bululu');

    rerender({ title: 'Mis espacios' });
    expect(document.title).toBe('Mis espacios · Bululu');

    unmount();
    expect(document.title).toBe('Bululu');
  });
});
