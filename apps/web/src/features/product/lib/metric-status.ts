import type { AdminMetricsResponse } from '@plaza/shared';

/** Targets of the beta (brief §3). */
export const TARGETS = {
  o1ConversationsPerUserDay: 3,
  o2SpacesAtTarget: 3,
  o3P95Ms: 1500,
  o4Rate: 0.98,
  o5P95Ms: 30_000,
  o6Rate: 0.7,
} as const;

export type MetricStatus = 'met' | 'notMet' | 'noData';

export type MetricId = 'o1' | 'o2' | 'o3' | 'o4' | 'o5' | 'o6';

function atLeast(value: number | null, target: number): MetricStatus {
  if (value === null) return 'noData';
  return value >= target ? 'met' : 'notMet';
}

function below(value: number | null, target: number): MetricStatus {
  if (value === null) return 'noData';
  return value < target ? 'met' : 'notMet';
}

/** Whether each objective reaches its target in the period. */
export function metricStatuses(metrics: AdminMetricsResponse): Record<MetricId, MetricStatus> {
  return {
    o1: atLeast(metrics.o1.perActiveUserPerDay, TARGETS.o1ConversationsPerUserDay),
    o2:
      metrics.o2.spaces.length === 0
        ? 'noData'
        : atLeast(metrics.o2.spacesAtTarget, TARGETS.o2SpacesAtTarget),
    o3: below(metrics.o3.p95Ms, TARGETS.o3P95Ms),
    o4: atLeast(metrics.o4.rate, TARGETS.o4Rate),
    o5: below(metrics.o5.p95Ms, TARGETS.o5P95Ms),
    o6: atLeast(metrics.o6.rate, TARGETS.o6Rate),
  };
}

const PERCENT = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 });
const DECIMAL = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const SECONDS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export function formatPercent(value: number): string {
  return PERCENT.format(value);
}

export function formatDecimal(value: number): string {
  return DECIMAL.format(value);
}

/** 1234 → "1,2 s". */
export function formatSeconds(ms: number): string {
  return `${SECONDS.format(ms / 1000)} s`;
}
