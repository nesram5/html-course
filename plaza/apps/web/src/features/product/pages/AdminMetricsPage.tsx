import type { AdminMetricsResponse } from '@plaza/shared';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageLoading, UserMenu } from '@/features/auth';
import { errorMessageKey, isApiError } from '@/shared/api';

import { fetchAdminMetrics, productKeys } from '../api/product-api';
import { MetricCards } from '../components/MetricCards';
import { formatDecimal } from '../lib/metric-status';

const PERIODS = [7, 14, 28, 56, 91] as const;
const DATE = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });
const DATE_TIME = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });

function SpacesTable({ metrics }: { readonly metrics: AdminMetricsResponse }) {
  const { t } = useTranslation('product');
  const titleId = useId();
  const weeks = Array.from({ length: metrics.o2.weeks }, (_, index) => index + 1);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-xl font-semibold">
        {t('metrics.spaces.title')}
      </h2>
      {metrics.o2.spaces.length === 0 ? (
        <p className="text-slate-700">{t('metrics.spaces.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col">{t('metrics.spaces.space')}</th>
                {weeks.map((week) => (
                  <th key={week} scope="col">
                    {t('metrics.spaces.week', { week })}
                  </th>
                ))}
                <th scope="col">{t('metrics.spaces.average')}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.o2.spaces.map((space) => (
                <tr key={space.spaceId} className="border-t border-slate-200">
                  <th scope="row" className="py-1 font-normal">
                    {space.name ?? t('metrics.spaces.deleted')}
                  </th>
                  {space.daysPerWeek.map((days, index) => (
                    <td key={weeks[index]}>{days}</td>
                  ))}
                  <td>{formatDecimal(space.avgDaysPerWeek)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FeedbackList({ metrics }: { readonly metrics: AdminMetricsResponse }) {
  const { t } = useTranslation('product');
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-xl font-semibold">
        {t('metrics.feedback.title')}
      </h2>
      {metrics.feedback.length === 0 ? (
        <p className="text-slate-700">{t('metrics.feedback.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {metrics.feedback.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
              <p className="whitespace-pre-wrap">{item.message}</p>
              <p className="mt-1 text-sm text-slate-600">
                {t('metrics.feedback.meta', {
                  name: item.authorName,
                  email: item.authorEmail,
                  date: DATE_TIME.format(new Date(item.createdAt)),
                })}
                {item.rating !== null &&
                  ` · ${t('metrics.feedback.rating', { rating: item.rating })}`}
                {item.spaceName !== null && ` · ${item.spaceName}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** `/admin/metricas`: the O1–O6 metrics of the beta and the pilots' feedback (E8-S7). */
export function AdminMetricsPage() {
  const { t } = useTranslation('product');
  const { t: tc } = useTranslation();
  const periodId = useId();
  const [days, setDays] = useState<number>(28);
  const metrics = useQuery({
    queryKey: productKeys.adminMetrics(days),
    queryFn: ({ signal }) => fetchAdminMetrics(days, signal),
    retry: false,
  });

  let content;
  if (metrics.isPending) content = <PageLoading />;
  else if (metrics.isError) {
    const denied = isApiError(metrics.error) && metrics.error.code === 'NOT_FOUND';
    content = (
      <p role="alert">{denied ? t('metrics.denied') : tc(errorMessageKey(metrics.error))}</p>
    );
  } else {
    content = (
      <>
        <p className="text-sm text-slate-600" role="status">
          {t('metrics.period', {
            from: DATE.format(new Date(metrics.data.from)),
            to: DATE.format(new Date(metrics.data.to)),
          })}
        </p>
        <MetricCards metrics={metrics.data} />
        <SpacesTable metrics={metrics.data} />
        <FeedbackList metrics={metrics.data} />
      </>
    );
  }

  return (
    <>
      <UserMenu />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-bold">{t('metrics.title')}</h1>
          <div className="flex flex-col gap-1">
            <label htmlFor={periodId} className="text-sm font-medium">
              {t('metrics.periodLabel')}
            </label>
            <select
              id={periodId}
              value={days}
              onChange={(event) => {
                setDays(Number(event.target.value));
              }}
              className="rounded-md border border-slate-400 px-2 py-1"
            >
              {PERIODS.map((period) => (
                <option key={period} value={period}>
                  {t('metrics.days', { count: period })}
                </option>
              ))}
            </select>
          </div>
        </div>
        {content}
      </main>
    </>
  );
}
