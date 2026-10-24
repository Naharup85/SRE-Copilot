import { env } from './config/env';
import { logger } from './config/logger';
import { createApplication } from './app';

const app = createApplication();

async function startServer() {
  const server = app.listen(env.PORT, () => {
    logger.info(`SRE Copilot API running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`Health check: http://localhost:${env.PORT}/health`);
  });

  const shutdown = () => {
    logger.info('Received shutdown signal, closing server...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer()
  .catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });

export default app;
