import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { metricsMiddleware, register } from './metrics';
import { authRouter } from './modules/auth/auth.routes';
import { applicationsRouter } from './modules/applications/applications.routes';
import { environmentsRouter, environmentStandaloneRouter } from './modules/environments/environments.routes';
import { deploymentsRouter, deploymentStandaloneRouter } from './modules/deployments/deployments.routes';
import { monitoringRouter } from './modules/monitoring/monitoring.routes';

export function createApplication() {
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

    // Metrics collection middleware
    app.use(metricsMiddleware);

    // Prometheus exposition endpoint
    app.get('/metrics', async (_req, res) => {
        res.setHeader('Content-Type', register.contentType);
        res.send(await register.metrics());
    });

    // Health check
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // API Routes
    const API_PREFIX = '/api/v1';

    app.use(`${API_PREFIX}/auth`, authRouter);
    app.use(`${API_PREFIX}/applications`, applicationsRouter);
    app.use(`${API_PREFIX}/applications/:applicationId/environments`, environmentsRouter);
    app.use(`${API_PREFIX}/environments`, environmentStandaloneRouter);
    app.use(`${API_PREFIX}/environments/:environmentId/deployments`, deploymentsRouter);
    app.use(`${API_PREFIX}/deployments`, deploymentStandaloneRouter);
    app.use(`${API_PREFIX}/monitoring`, monitoringRouter);
    app.use('/api/monitoring', monitoringRouter);

    // Error handling (must be last)
    app.use(errorHandler);

    return app;
}
