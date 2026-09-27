import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * Which side panel of the office is open (E7: "Personas", chat…). The panels come from several
 * features (`SpaceExtension.Panel`) and share the same place on the right, so opening one closes
 * the other. Each feature picks its own panel id.
 */
export interface SidePanelState {
  readonly open: string | null;
  /** Opens `id`, or closes it when it is already open. */
  toggle(id: string): void;
  close(): void;
}

export type SidePanelStore = StoreApi<SidePanelState>;

export function createSidePanelStore(): SidePanelStore {
  return createStore<SidePanelState>()((set) => ({
    open: null,
    toggle: (id) => {
      set((state) => ({ open: state.open === id ? null : id }));
    },
    close: () => {
      set({ open: null });
    },
  }));
}

/** The side panel of the office page. */
export const sidePanelStore = createSidePanelStore();

export function useSidePanel<T>(selector: (state: SidePanelState) => T): T {
  return useStore(sidePanelStore, selector);
}
