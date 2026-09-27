import type { DeskDecor, DeskState, MeetingRoomDto } from '@bululu/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Decoration being chosen in the "Decorar" panel, drawn on the desk before saving (E9-S3). */
export interface DecorPreview {
  readonly deskId: string;
  readonly decor: DeskDecor;
}

/**
 * The office as the server tells it: the current style and the held desks with their owner and
 * decoration (E9), and the meeting rooms with their Meet link (E6). Written by the realtime
 * session (`space:snapshot`, `space:theme`, `desk:updated`, `room:updated`); read by the scene
 * (style, desk labels and objects), the desk panels and the room card.
 */
export interface OfficeState {
  /** Style of the space, `null` until the first snapshot (the page loaded its own). */
  readonly themeId: string | null;
  /** Held desks by `deskId`; free desks are absent. */
  readonly desks: Readonly<Record<string, DeskState>>;
  readonly preview: DecorPreview | null;
  /** Meeting rooms by `areaId`, with their Meet link (`null` until one is set, E2-S7). */
  readonly rooms: Readonly<Record<string, MeetingRoomDto>>;
  applySnapshot(themeId: string, desks: readonly DeskState[]): void;
  /** Rooms of a `space:snapshot`. */
  setRooms(rooms: readonly MeetingRoomDto[]): void;
  /** `room:updated`: a room got or changed its Meet link. */
  applyRoom(room: MeetingRoomDto): void;
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
    rooms: {},
    applySnapshot: (themeId, desks) => {
      set({
        themeId,
        desks: Object.fromEntries(
          desks.filter((desk) => desk.userId !== null).map((desk) => [desk.deskId, desk]),
        ),
      });
    },
    setRooms: (rooms) => {
      set({ rooms: Object.fromEntries(rooms.map((room) => [room.areaId, room])) });
    },
    applyRoom: (room) => {
      set((state) => ({ rooms: { ...state.rooms, [room.areaId]: room } }));
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
      set({ themeId: null, desks: {}, preview: null, rooms: {} });
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
