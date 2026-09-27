import type { DeskDecor, DeskState } from '@plaza/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Decoration being chosen in the "Decorar" panel, drawn on the desk before saving (E9-S3). */
export interface DecorPreview {
  readonly deskId: string;
  readonly decor: DeskDecor;
}

/**
 * Personalization of the office as the server tells it (E9): the current style and the held
 * desks with their owner and decoration. Written by the realtime session (`space:snapshot`,
 * `space:theme`, `desk:updated`); read by the scene (style, desk labels and objects) and the
 * desk panels.
 */
export interface OfficeState {
  /** Style of the space, `null` until the first snapshot (the page loaded its own). */
  readonly themeId: string | null;
  /** Held desks by `deskId`; free desks are absent. */
  readonly desks: Readonly<Record<string, DeskState>>;
  readonly preview: DecorPreview | null;
  applySnapshot(themeId: string, desks: readonly DeskState[]): void;
  setTheme(themeId: string): void;
  /** `desk:updated`: a desk with `userId: null` is free again. */
  applyDesk(desk: DeskState): void;
  setPreview(preview: DecorPreview | null): void;
  reset(): void;
}

export type OfficeStore = StoreApi<OfficeState>;

export function createOfficeStore(): OfficeStore {
  return createStore<OfficeState>()((set) => ({
    themeId: null,
    desks: {},
    preview: null,
    applySnapshot: (themeId, desks) => {
      set({
        themeId,
        desks: Object.fromEntries(
          desks.filter((desk) => desk.userId !== null).map((desk) => [desk.deskId, desk]),
        ),
      });
    },
    setTheme: (themeId) => {
      set({ themeId });
    },
    applyDesk: (desk) => {
      set((state) => {
        const { [desk.deskId]: _previous, ...others } = state.desks;
        return { desks: desk.userId === null ? others : { ...others, [desk.deskId]: desk } };
      });
    },
    setPreview: (preview) => {
      set({ preview });
    },
    reset: () => {
      set({ themeId: null, desks: {}, preview: null });
    },
  }));
}

/** The app-wide office store. */
export const officeStore = createOfficeStore();

/** React binding of {@link officeStore} (or of another store, in tests). */
export function useOfficeStore<T>(
  selector: (state: OfficeState) => T,
  store: OfficeStore = officeStore,
): T {
  return useStore(store, selector);
}

/** The desk held by `userId`, if any. */
export function deskOfUser(state: Pick<OfficeState, 'desks'>, userId: string): DeskState | null {
  for (const desk of Object.values(state.desks)) if (desk.userId === userId) return desk;
  return null;
}
