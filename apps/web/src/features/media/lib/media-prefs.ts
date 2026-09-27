import { z } from 'zod';

/** What the person chose in the pre-join (E5-S4): what to publish and with which devices. */
export interface MediaChoices {
  readonly audioEnabled: boolean;
  readonly videoEnabled: boolean;
  /** `null`: the browser default. */
  readonly audioDeviceId: string | null;
  readonly videoDeviceId: string | null;
  readonly audioOutputDeviceId: string | null;
}

export const DEFAULT_MEDIA_CHOICES: MediaChoices = {
  audioEnabled: true,
  videoEnabled: true,
  audioDeviceId: null,
  videoDeviceId: null,
  audioOutputDeviceId: null,
};

const PREFS_KEY = 'bululu.media.choices.v1';
const HALLWAY_NOTICE_KEY = 'bululu.media.hallwayNoticeSeen.v1';

const StoredChoicesSchema = z.object({
  audioEnabled: z.boolean(),
  videoEnabled: z.boolean(),
  audioDeviceId: z.string().min(1).nullable(),
  videoDeviceId: z.string().min(1).nullable(),
  audioOutputDeviceId: z.string().min(1).nullable(),
});

/** Where the preferences live: `localStorage`, or nothing when the browser blocks it. */
export type PrefsStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): PrefsStorage | null {
  try {
    return window.localStorage;
  } catch {
    // Blocked (privacy settings, sandboxed iframe): preferences are simply not remembered.
    return null;
  }
}

function read(storage: PrefsStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: PrefsStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Full or blocked storage: the choice only lasts for this visit.
  }
}

/** The devices chosen last time ("cuando vuelvo otro día, se recuerdan"), or the defaults. */
export function loadMediaChoices(storage: PrefsStorage | null = browserStorage()): MediaChoices {
  const raw = read(storage, PREFS_KEY);
  if (raw === null) return DEFAULT_MEDIA_CHOICES;
  try {
    const parsed = StoredChoicesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_MEDIA_CHOICES;
  } catch {
    return DEFAULT_MEDIA_CHOICES;
  }
}

export function saveMediaChoices(
  choices: MediaChoices,
  storage: PrefsStorage | null = browserStorage(),
): void {
  write(storage, PREFS_KEY, JSON.stringify(StoredChoicesSchema.parse(choices)));
}

/** Whether the "the hallway is not private" notice (RN-12) was already acknowledged. */
export function hallwayNoticeSeen(storage: PrefsStorage | null = browserStorage()): boolean {
  return read(storage, HALLWAY_NOTICE_KEY) === 'true';
}

export function markHallwayNoticeSeen(storage: PrefsStorage | null = browserStorage()): void {
  write(storage, HALLWAY_NOTICE_KEY, 'true');
}
