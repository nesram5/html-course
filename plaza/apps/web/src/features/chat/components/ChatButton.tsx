import { useTranslation } from 'react-i18next';

import { chatStore, useChatStore, type ChatStore } from '../store/chat-store';

export interface ChatButtonProps {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** id of the panel it opens. */
  readonly controls?: string;
  readonly id?: string;
  readonly store?: ChatStore;
}

/** "Chat" button of the bottom bar with the unread counter (E7-S3). */
export function ChatButton({
  expanded,
  onToggle,
  controls,
  id,
  store = chatStore,
}: ChatButtonProps) {
  const { t } = useTranslation('chat');
  const unread = useChatStore((state) => state.unread, store);
  return (
    <button
      id={id}
      type="button"
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      aria-label={unread > 0 ? t('button.unread', { count: unread }) : t('button.label')}
      className="relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-white hover:bg-white/10 aria-expanded:bg-white/15"
      onClick={onToggle}
    >
      <span aria-hidden="true">💬</span>
      {t('button.text')}
      {unread > 0 && (
        <span
          data-testid="chat-unread"
          className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
