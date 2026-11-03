import { Request, Response, NextFunction } from 'express';
import { environmentsService } from './environments.service';
import { validateUuid } from '../../utils/validate';
import { sendSuccess, sendCreated } from '../../utils/response';
import { resolveMonitoringProvider } from '../../services/monitoring-provider.resolver';
import { resolveLoggingProvider } from '../../services/logging-provider.resolver';

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
    sendSuccess(res, metrics);
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
