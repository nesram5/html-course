import { CHAT_MAX_LEN, type ChatMessageDto } from '@plaza/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { isRealtimeRequestError } from '@/features/world';

import { sendChatMessage } from '../hooks/useChatSession';
import { chatStore, useChatStore, type ChatStore } from '../store/chat-store';
import { MessageBody } from './MessageBody';

export interface ChatPanelProps {
  /** Display name of each author by userId (connected people and members). */
  readonly names: Readonly<Record<string, string>>;
  readonly selfId: string | null;
  readonly onClose: () => void;
  readonly send?: (body: string) => Promise<void>;
  readonly store?: ChatStore;
}

const TIME = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * Chat of the space (E7-S3): the last 100 messages and a text box. While the box has the focus,
 * the keyboard types instead of walking (the world ignores keys typed in text fields). Enter
 * sends; messages over 1000 characters and server errors (5 per second) are explained.
 */
export function ChatPanel({
  names,
  selfId,
  onClose,
  send = sendChatMessage,
  store = chatStore,
}: ChatPanelProps) {
  const { t } = useTranslation('chat');
  const { t: tc } = useTranslation();
  const messages = useChatStore((state) => state.messages, store);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const titleId = useId();
  const errorId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    store.getState().setOpen(true);
    inputRef.current?.focus();
    return () => {
      store.getState().setOpen(false);
    };
  }, [store]);

  useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const length = draft.trim().length;
  const tooLong = length > CHAT_MAX_LEN;

  const submit = async (event?: SyntheticEvent) => {
    event?.preventDefault();
    if (sending) return;
    if (length === 0) {
      setError(t('input.empty'));
      return;
    }
    if (tooLong) {
      setError(t('input.tooLong', { max: CHAT_MAX_LEN, count: length }));
      return;
    }
    setSending(true);
    try {
      await send(draft);
      setDraft('');
      setError(null);
    } catch (failure) {
      const code = isRealtimeRequestError(failure) ? failure.code : 'INTERNAL';
      setError(t('input.failed', { reason: tc(`errors.${code}`) }));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape') {
      event.currentTarget.blur();
    }
  };

  const authorOf = (message: ChatMessageDto): string => {
    if (message.authorId === null) return t('author.deleted');
    if (message.authorId === selfId) return t('author.you');
    return names[message.authorId] ?? t('author.unknown');
  };

  return (
    <section
      aria-labelledby={titleId}
      className="flex h-full w-80 max-w-full flex-col rounded-lg bg-white text-slate-900 shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          {t('panel.title')}
        </h2>
        <button
          type="button"
          aria-label={t('panel.close')}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <ol
        ref={listRef}
        aria-label={t('panel.messages')}
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 && <li className="text-sm text-slate-500">{t('panel.empty')}</li>}
        {messages.map((message) => (
          <li key={message.id} data-testid="chat-message">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{authorOf(message)}</span>
              <time dateTime={message.createdAt} className="text-xs text-slate-500">
                {TIME.format(new Date(message.createdAt))}
              </time>
            </div>
            <MessageBody body={message.body} />
          </li>
        ))}
      </ol>
      <form
        className="flex flex-col gap-1 border-t border-slate-200 p-3"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={draft}
            aria-label={t('input.label')}
            aria-invalid={error !== null || tooLong}
            aria-describedby={error === null ? undefined : errorId}
            placeholder={t('input.placeholder')}
            className="min-w-0 flex-1 resize-none rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            onChange={(event) => {
              setDraft(event.target.value);
              if (error !== null) setError(null);
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {t('input.send')}
          </button>
        </div>
        {length > CHAT_MAX_LEN * 0.9 && (
          <span className={`text-xs ${tooLong ? 'text-red-700' : 'text-slate-500'}`}>
            {t('input.counter', { count: length, max: CHAT_MAX_LEN })}
          </span>
        )}
        {error !== null && (
          <p id={errorId} role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
