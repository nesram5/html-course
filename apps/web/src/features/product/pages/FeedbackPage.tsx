import { FEEDBACK_MAX_LEN } from '@bululu/shared';
import { useMutation } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { UserMenu } from '@/features/auth';
import { errorMessageKey } from '@/shared/api';

import { sendFeedback } from '../api/product-api';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';

const RATINGS = [
  [1, 'feedback.ratings.1'],
  [2, 'feedback.ratings.2'],
  [3, 'feedback.ratings.3'],
  [4, 'feedback.ratings.4'],
  [5, 'feedback.ratings.5'],
] as const;

/** `/comentarios`: the in-app feedback form of the pilot teams (E8-S7), from the user menu. */
export function FeedbackPage() {
  const { t } = useTranslation('product');
  const { t: tc } = useTranslation();
  useDocumentTitle(tc('docTitle.feedback'));
  const messageId = useId();
  const hintId = useId();
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const send = useMutation({
    mutationFn: sendFeedback,
    meta: { silent: true },
    onSuccess: () => {
      setMessage('');
      setRating(null);
      statusRef.current?.focus();
    },
  });
  const empty = message.trim() === '';

  return (
    <>
      <UserMenu />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
        <div>
          <h1 className="text-3xl font-bold">{t('feedback.title')}</h1>
          <p className="mt-2 text-slate-700">{t('feedback.intro')}</p>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (empty) return;
            send.mutate({ message: message.trim(), ...(rating !== null && { rating }) });
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={messageId} className="font-medium">
              {t('feedback.message')}
            </label>
            <textarea
              id={messageId}
              aria-describedby={hintId}
              required
              rows={6}
              maxLength={FEEDBACK_MAX_LEN}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
              }}
              className="rounded-md border border-slate-400 p-2"
            />
            <p id={hintId} className="text-sm text-slate-600">
              {t('feedback.hint', { max: FEEDBACK_MAX_LEN })}
            </p>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="font-medium">{t('feedback.rating')}</legend>
            <div className="flex flex-wrap gap-3">
              {RATINGS.map(([value, key]) => (
                <label key={value} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={rating === value}
                    onChange={() => {
                      setRating(value);
                    }}
                  />
                  {t(key)}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={send.isPending || empty}
            className="self-start rounded-md bg-brand-600 px-5 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {send.isPending ? t('feedback.sending') : t('feedback.send')}
          </button>
          <p ref={statusRef} tabIndex={-1} role="status" className="text-sm">
            {send.isSuccess && t('feedback.thanks')}
          </p>
          {send.isError && (
            <p role="alert" className="text-sm text-red-700">
              {tc(errorMessageKey(send.error))}
            </p>
          )}
        </form>
      </main>
    </>
  );
}
