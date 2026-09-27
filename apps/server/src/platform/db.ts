import { PrismaClient } from '@prisma/client';

import type { Logger } from './logger.js';

export type Database = PrismaClient;

/** Creates the Prisma client. It connects lazily on the first query. */
export function createPrismaClient(databaseUrl: string, logger: Logger): Database {
  const prisma = new PrismaClient({
    datasourceUrl: databaseUrl,
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });
  prisma.$on('warn', (event) => {
    logger.warn({ target: event.target }, event.message);
  });
  prisma.$on('error', (event) => {
    logger.error({ target: event.target }, event.message);
  });
  return prisma;
}
