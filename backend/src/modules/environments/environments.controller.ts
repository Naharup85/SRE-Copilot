import { Request, Response, NextFunction } from 'express';
import { environmentsService } from './environments.service';
import { validateUuid } from '../../utils/validate';
import { sendSuccess, sendCreated } from '../../utils/response';
import { resolveMonitoringProvider } from '../../services/monitoring-provider.resolver';
import { resolveLoggingProvider } from '../../services/logging-provider.resolver';
import { prometheusService } from '../../services/prometheus.service';
import { AppError } from '../../utils/errors';

export const createEnvironment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { applicationId } = req.params;
    validateUuid(applicationId, 'applicationId');
    const input = req.body;
    const env = await environmentsService.create(req.user!.id, applicationId, input);
    sendCreated(res, env);
  } catch (error) {
    next(error);
  }
};

export const listEnvironments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { applicationId } = req.params;
    validateUuid(applicationId, 'applicationId');
    const envs = await environmentsService.listByApplication(req.user!.id, applicationId);
    sendSuccess(res, envs);
  } catch (error) {
    next(error);
  }
};

export const getEnvironment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'environmentId');
    const env = await environmentsService.getById(req.user!.id, req.params.id);
    sendSuccess(res, env);
  } catch (error) {
    next(error);
  }
};

export const updateEnvironment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'environmentId');
    const input = req.body;
    const env = await environmentsService.update(req.user!.id, req.params.id, input);
    sendSuccess(res, env);
  } catch (error) {
    next(error);
  }
};

export const deleteEnvironment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'environmentId');
    await environmentsService.delete(req.user!.id, req.params.id);
    sendSuccess(res, { deleted: true });
  } catch (error) {
    next(error);
  }
};

export const getEnvironmentMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'environmentId');
    const env = await environmentsService.getById(req.user!.id, req.params.id);
    const monitoringProvider = resolveMonitoringProvider(env);
    const metrics = await monitoringProvider.getMetrics(env);

    // If Standard SRE, enrich with Prometheus metrics when available
    if (env.sreProfile === 'standard') {
      const pHealth = await prometheusService.checkHealth();
      if (pHealth.connected) {
        const appMetrics = await prometheusService.getApplicationMetrics(env.applicationId, env.name);
        metrics.prometheus = {
          enabled: true,
          connected: true,
          status: 'connected',
          metrics: {
            requestRate: appMetrics.requestRate,
            errorRate: appMetrics.errorRate,
            latencyP95Ms: appMetrics.latencyP95Ms,
            totalRequests: appMetrics.totalRequests,
          },
        };
      } else {
        metrics.prometheus = {
          enabled: pHealth.enabled,
          connected: false,
          status: pHealth.status,
          metrics: null,
        };
      }
    } else {
      // Basic SRE: Native lightweight monitoring without requiring Prometheus
      metrics.prometheus = {
        enabled: false,
        connected: false,
        status: 'disabled',
        metrics: null,
      };
    }

    sendSuccess(res, metrics);
  } catch (error) {
    next(error);
  }
};

export const getEnvironmentMetricsHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'environmentId');
    const env = await environmentsService.getById(req.user!.id, req.params.id);

    const now = Math.floor(Date.now() / 1000);
    let start = req.query.start ? Number(req.query.start) : now - 3600;
    let end = req.query.end ? Number(req.query.end) : now;
    const step = req.query.step ? String(req.query.step) : '60s';

    // If millisecond timestamps provided, convert to seconds
    if (start > 1e11) start = Math.floor(start / 1000);
    if (end > 1e11) end = Math.floor(end / 1000);

    if (isNaN(start) || isNaN(end)) {
      throw new AppError('INVALID_QUERY_RANGE', 'Start and end must be valid timestamps', 400);
    }

    if (start >= end) {
      throw new AppError('INVALID_QUERY_RANGE', 'Start time must be before end time', 400);
    }

    const MAX_RANGE_SECONDS = 30 * 24 * 3600; // 30 days
    if (end - start > MAX_RANGE_SECONDS) {
      throw new AppError('INVALID_QUERY_RANGE', 'Query range exceeds maximum of 30 days', 400);
    }

    if (!/^\d+[smhd]$/.test(step)) {
      throw new AppError('INVALID_STEP', 'Step must be a valid duration (e.g. 15s, 60s, 5m, 1h)', 400);
    }

    const history = await prometheusService.getHistoricalMetrics(env.id, { start, end, step });
    sendSuccess(res, history);
  } catch (error) {
    next(error);
  }
};

export const getContainerLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'environmentId');
    const env = await environmentsService.getById(req.user!.id, req.params.id);
    const lines = req.query.lines ? Math.min(1000, Math.max(1, Number(req.query.lines))) : 100;
    const loggingProvider = resolveLoggingProvider(env);
    const logs = await loggingProvider.getContainerLogs(env, lines);
    sendSuccess(res, logs);
  } catch (error) {
    next(error);
  }
};
