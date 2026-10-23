import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { logger } from './config/logger';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { applicationsRouter } from './modules/applications/applications.routes';
import { environmentsRouter, environmentStandaloneRouter } from './modules/environments/environments.routes';
import { deploymentsRouter, deploymentStandaloneRouter } from './modules/deployments/deployments.routes';

const app = express();

// Security
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRouter);
app.use(`${API_PREFIX}/applications`, applicationsRouter);
app.use(`${API_PREFIX}/applications/:applicationId/environments`, (_req, _res, next) => {
  // Pass applicationId to the router
  next();
}, environmentsRouter);
app.use(`${API_PREFIX}/environments`, environmentStandaloneRouter);
app.use(`${API_PREFIX}/environments/:environmentId/deployments`, deploymentsRouter);
app.use(`${API_PREFIX}/deployments`, deploymentStandaloneRouter);

// Error handling (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 SRE Copilot API running on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`📚 Health check: http://localhost:${env.PORT}/health`);
});

// Graceful shutdown
const shutdown = () => {
  logger.info('Received shutdown signal, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
