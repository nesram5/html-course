import { AWAY_IDLE_MS } from '@plaza/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePresenceActivity } from '../hooks/usePresenceActivity';

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState): void {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('usePresenceActivity (E7-S1, RN-05)', () => {
  it('becomes away when the tab is hidden and back when it is visible again', () => {
    const onChange = vi.fn();
    renderHook(() => {
      usePresenceActivity(onChange);
    });

    act(() => {
      setVisibility('hidden');
    });
    expect(onChange).toHaveBeenLastCalledWith(true);

    act(() => {
      setVisibility('visible');
    });
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('becomes away after 10 minutes without interaction, not before', () => {
    const onChange = vi.fn();
    renderHook(() => {
      usePresenceActivity(onChange);
    });

    act(() => {
      vi.advanceTimersByTime(AWAY_IDLE_MS - 1);
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('any interaction restarts the 10 minutes and brings the person back', () => {
    const onChange = vi.fn();
    renderHook(() => {
      usePresenceActivity(onChange);
    });

    act(() => {
      vi.advanceTimersByTime(AWAY_IDLE_MS - 1000);
      window.dispatchEvent(new Event('pointermove'));
      vi.advanceTimersByTime(AWAY_IDLE_MS - 1000);
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).toHaveBeenLastCalledWith(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    expect(onChange).toHaveBeenLastCalledWith(false);

    // Idle again 10 minutes after that key.
    act(() => {
      vi.advanceTimersByTime(AWAY_IDLE_MS);
    });
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('interactions while hidden do not bring the person back', () => {
    const onChange = vi.fn();
    renderHook(() => {
      usePresenceActivity(onChange);
    });

    act(() => {
      setVisibility('hidden');
      window.dispatchEvent(new Event('pointermove'));
    });

    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('starts away in a hidden tab and stops listening on unmount', () => {
    visibility = 'hidden';
    const onChange = vi.fn();
    const { unmount } = renderHook(() => {
      usePresenceActivity(onChange, { idleMs: 1000 });
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);

    unmount();
    act(() => {
      setVisibility('visible');
      vi.advanceTimersByTime(5000);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
