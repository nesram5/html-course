import type { AdminMetricsResponse, DurationStats } from '@bululu/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import {
  formatDecimal,
  formatPercent,
  formatSeconds,
  metricStatuses,
  type MetricId,
  type MetricStatus,
} from '../lib/metric-status';

const STATUS_TONE: Record<MetricStatus, string> = {
  met: 'border-green-700 bg-green-50 text-green-900',
  notMet: 'border-amber-700 bg-amber-50 text-amber-900',
  noData: 'border-slate-400 bg-slate-50 text-slate-700',
};

interface CardProps {
  readonly id: MetricId;
  readonly value: string;
  readonly detail: string;
  readonly status: MetricStatus;
}

function MetricCard({ id, value, detail, status }: CardProps) {
  const { t } = useTranslation('product');
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-metric={id}
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 id={titleId} className="font-semibold">
        {t(`metrics.${id}.title`)}
      </h2>
      <p className="text-3xl font-bold" data-testid={`metric-${id}-value`}>
        {value}
      </p>
      <p className="text-sm text-slate-700">{detail}</p>
      <p className="text-sm text-slate-700">{t(`metrics.${id}.target`)}</p>
      <p
        className={`self-start rounded border px-2 py-0.5 text-sm font-medium ${STATUS_TONE[status]}`}
      >
        {t(`metrics.status.${status}`)}
      </p>
      <p className="text-xs text-slate-600">{t(`metrics.${id}.how`)}</p>
    </section>
  );
}

function p95(stats: DurationStats, empty: string): string {
  return stats.p95Ms === null ? empty : formatSeconds(stats.p95Ms);
}

/** The six objectives of the brief (§3) with their target and whether they reach it. */
export function MetricCards({ metrics }: { readonly metrics: AdminMetricsResponse }) {
  const { t } = useTranslation('product');
  const status = metricStatuses(metrics);
  const none = t('metrics.none');
  const { o1, o2, o3, o4, o5, o6 } = metrics;

  const cards: CardProps[] = [
    {
      id: 'o1',
      value: o1.perActiveUserPerDay === null ? none : formatDecimal(o1.perActiveUserPerDay),
      detail: t('metrics.o1.detail', { conversations: o1.conversations, days: o1.activeUserDays }),
      status: status.o1,
    },
    {
      id: 'o2',
      value: t('metrics.o2.value', { count: o2.spacesAtTarget, total: o2.spaces.length }),
      detail: t('metrics.o2.detail', { weeks: o2.weeks }),
      status: status.o2,
    },
    {
      id: 'o3',
      value: p95(o3, none),
      detail: t('metrics.duration', {
        count: o3.samples,
        p50: o3.p50Ms === null ? none : formatSeconds(o3.p50Ms),
      }),
      status: status.o3,
    },
    {
      id: 'o4',
      value: o4.rate === null ? none : formatPercent(o4.rate),
      detail: t('metrics.o4.detail', { sessions: o4.sessions, errors: o4.sessionsWithErrors }),
      status: status.o4,
    },
    {
      id: 'o5',
      value: p95(o5, none),
      detail: t('metrics.duration', {
        count: o5.samples,
        p50: o5.p50Ms === null ? none : formatSeconds(o5.p50Ms),
      }),
      status: status.o5,
    },
    {
      id: 'o6',
      value: o6.rate === null ? none : formatPercent(o6.rate),
      detail: t('metrics.o6.detail', { opened: o6.meetOpened, entries: o6.roomEntries }),
      status: status.o6,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <MetricCard key={card.id} {...card} />
      ))}
    </div>
  );
}
