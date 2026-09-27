import {
  AdminMetricsQuerySchema,
  AdminMetricsResponseSchema,
  API_PATHS,
  type AdminFeedback,
  type AdminMetricsResponse,
} from '@plaza/shared';

import type { Database } from '../../platform/db.js';
import { AppError } from '../../platform/errors.js';
import { currentUser } from '../auth/index.js';
import type { PlazaModule } from '../types.js';
import { isAdminEmail } from '../users/index.js';
import { computeAdminMetrics, metricsWindow } from './admin-metrics.js';

export {
  computeAdminMetrics,
  metricsWindow,
  percentile,
  type MetricEvent,
} from './admin-metrics.js';

/** How many feedback messages the metrics page lists. */
const FEEDBACK_LIMIT = 50;

/** The O1–O6 metrics page of the product team (E8-S7): people in `ADMIN_EMAILS` only. */
export class AdminService {
  constructor(
    private readonly db: Database,
    private readonly adminEmails: readonly string[],
    private readonly now: () => Date,
  ) {}

  /** Anyone else gets 404, so the page does not reveal it exists. */
  async assertAdmin(userId: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user === null || !isAdminEmail(this.adminEmails, user.email)) {
      throw new AppError('NOT_FOUND');
    }
  }

  async metrics(userId: string, days: number): Promise<AdminMetricsResponse> {
    await this.assertAdmin(userId);
    const window = metricsWindow(this.now(), days);
    const events = await this.db.productEvent.findMany({
      where: { createdAt: { gte: window.from, lte: window.to } },
      orderBy: { createdAt: 'asc' },
      select: { name: true, spaceId: true, actorId: true, props: true, createdAt: true },
    });
    const spaceIds = [
      ...new Set(events.flatMap((event) => (event.spaceId === null ? [] : [event.spaceId]))),
    ];
    const spaces = await this.db.space.findMany({
      where: { id: { in: spaceIds } },
      select: { id: true, name: true },
    });
    const names = new Map(spaces.map((space) => [space.id, space.name]));
    return {
      ...computeAdminMetrics(events, window, names),
      feedback: await this.#feedback(),
    };
  }

  async #feedback(): Promise<AdminFeedback[]> {
    const rows = await this.db.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: FEEDBACK_LIMIT,
      include: { user: { select: { displayName: true, email: true } } },
    });
    const spaceIds = [
      ...new Set(rows.flatMap((row) => (row.spaceId === null ? [] : [row.spaceId]))),
    ];
    const spaces = await this.db.space.findMany({
      where: { id: { in: spaceIds } },
      select: { id: true, name: true },
    });
    const names = new Map(spaces.map((space) => [space.id, space.name]));
    return rows.map((row) => ({
      id: row.id,
      message: row.message,
      rating: row.rating,
      createdAt: row.createdAt.toISOString(),
      authorName: row.user.displayName,
      authorEmail: row.user.email,
      spaceName: row.spaceId === null ? null : (names.get(row.spaceId) ?? null),
    }));
  }
}

/** Admin module (E8-S7): `GET /api/admin/metrics`. */
export const adminModule: PlazaModule = {
  name: 'admin',
  register({ app, container, services }) {
    const admin = new AdminService(container.db, container.config.adminEmails, container.now);
    app.get(
      API_PATHS.adminMetrics,
      { preHandler: services.get('auth').requireUser },
      async (request): Promise<AdminMetricsResponse> => {
        const { days } = AdminMetricsQuerySchema.parse(request.query);
        const metrics = await admin.metrics(currentUser(request).userId, days);
        return AdminMetricsResponseSchema.parse(metrics);
      },
    );
  },
};
