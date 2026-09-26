import process from 'node:process';

import { buildApp } from './app.js';
import { createContainer } from './container.js';
import { ConfigError, loadConfig, type AppConfig } from './platform/config.js';
import { createErrorReporter } from './platform/error-reporter.js';
import { createLogger } from './platform/logger.js';

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // The process must not start and the log must say which variable is wrong (E0-S3).
    const logger = createLogger({ logLevel: 'info', env: 'production', version: 'unknown' });
    logger.fatal(
      { invalidVariables: error.variables, problems: error.problems },
      `Invalid configuration, refusing to start: ${error.problems.join('; ')}`,
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const config = loadConfigOrExit();
  const logger = createLogger(config);
  const reporter = await createErrorReporter(config, logger);
  const container = createContainer({ config, logger, reporter });
  const app = await buildApp(container);

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
    reporter.captureException(reason);
  });

  let closing = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Shutting down');
    void app
      .close()
      .then(() => reporter.flush())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (config.authTestLogin)
    logger.warn('AUTH_TEST_LOGIN is enabled: test sign-in route is exposed');
  await app.listen({ host: config.host, port: config.port });
}

await main();
