import {
  AdminMetricsResponseSchema,
  API_PATHS,
  type AdminMetricsResponse,
  type FeedbackBody,
  type TelemetrySample,
} from '@plaza/shared';

import { http } from '@/shared/api';

/** Query keys of the product feature (standards §5). */
export const productKeys = {
  adminMetrics: (days: number) => ['product', 'admin-metrics', days] as const,
};

/** In-app feedback (E8-S7). */
export function sendFeedback(body: FeedbackBody): Promise<void> {
  return http(API_PATHS.feedback, null, { method: 'POST', body });
}

/** O1–O6 metrics (people in `ADMIN_EMAILS` only; 404 for everyone else). */
export function fetchAdminMetrics(
  days: number,
  signal?: AbortSignal,
): Promise<AdminMetricsResponse> {
  return http(API_PATHS.adminMetrics, AdminMetricsResponseSchema, {
    query: { days },
    ...(signal !== undefined && { signal }),
  });
}

/** Client telemetry (O3, O4, O5). `keepalive` when sent while the page goes away. */
export function postTelemetry(
  samples: readonly TelemetrySample[],
  keepalive = false,
): Promise<void> {
  return http(API_PATHS.telemetry, null, {
    method: 'POST',
    body: { samples },
    keepalive,
  });
}
