import { CHAT_HISTORY, type ChatMessageDto } from '@bululu/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface ChatState {
  /** Oldest first, at most {@link CHAT_HISTORY}, no duplicates. */
  readonly messages: readonly ChatMessageDto[];
  /** Messages of other people received while the panel was closed (E7-S3). */
  readonly unread: number;
  readonly open: boolean;
  /** Merges the stored history (entering, reconnecting) with what already arrived. */
  mergeHistory(history: readonly ChatMessageDto[]): void;
  /** A new message; `own` ones never count as unread. */
  receive(message: ChatMessageDto, own: boolean): void;
  setOpen(open: boolean): void;
  reset(): void;
}

export type ChatStore = StoreApi<ChatState>;

function byTime(a: ChatMessageDto, b: ChatMessageDto): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

function mergeMessages(
  current: readonly ChatMessageDto[],
  incoming: readonly ChatMessageDto[],
): ChatMessageDto[] {
  const byId = new Map<string, ChatMessageDto>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(byTime).slice(-CHAT_HISTORY);
}

/** Chat of the space (standards §5: `chatStore`). */
export function createChatStore(): ChatStore {
  return createStore<ChatState>()((set, get) => ({
    messages: [],
    unread: 0,
    open: false,
    mergeHistory: (history) => {
      set({ messages: mergeMessages(get().messages, history) });
    },
    receive: (message, own) => {
      const { messages, open, unread } = get();
      if (messages.some((existing) => existing.id === message.id)) return;
      set({
        messages: mergeMessages(messages, [message]),
        unread: open || own ? unread : unread + 1,
      });
    },
    setOpen: (open) => {
      set(open ? { open, unread: 0 } : { open });
    },
    reset: () => {
      set({ messages: [], unread: 0, open: false });
    },
  }));
}

export const chatStore = createChatStore();

export function useChatStore<T>(
  selector: (state: ChatState) => T,
  store: ChatStore = chatStore,
): T {
  return useStore(store, selector);
}
