import { Request, Response, NextFunction } from 'express';
import { applicationsService } from './applications.service';
import { prometheusService } from '../../services/prometheus.service';
import { validateUuid } from '../../utils/validate';
import { sendCreated, sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/errors';

export const createApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = req.body;
    const app = await applicationsService.create(req.user!.id, input);
    sendCreated(res, app);
  } catch (error) {
    next(error);
  }
};

export const listApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const apps = await applicationsService.list(req.user!.id);
    sendSuccess(res, apps);
  } catch (error) {
    next(error);
  }
};

export const getApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    const app = await applicationsService.getById(req.user!.id, req.params.id);
    sendSuccess(res, app);
  } catch (error) {
    next(error);
  }
};

export const updateApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    const app = await applicationsService.update(req.user!.id, req.params.id, req.body);
    sendSuccess(res, app);
  } catch (error) {
    next(error);
  }
};

export const deleteApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    await applicationsService.delete(req.user!.id, req.params.id);
    sendSuccess(res, { deleted: true });
  } catch (error) {
    next(error);
  }
};

export const getApplicationMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    const app = await applicationsService.getById(req.user!.id, req.params.id);
    const metrics = await prometheusService.getApplicationMetrics(app.id, app.name);
    sendSuccess(res, metrics);
  } catch (error) {
    next(error);
  }
};

export const getApplicationApm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    const app = await applicationsService.getById(req.user!.id, req.params.id);
    const apm = await prometheusService.getApmOverview(app.id, app.name);
    sendSuccess(res, apm);
  } catch (error) {
    next(error);
  }
};

export const getApplicationApmEndpoints = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    const app = await applicationsService.getById(req.user!.id, req.params.id);
    const endpoints = await prometheusService.getApmEndpoints(app.id);
    sendSuccess(res, { applicationId: app.id, endpoints });
  } catch (error) {
    next(error);
  }
};

export const getApplicationApmDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    const app = await applicationsService.getById(req.user!.id, req.params.id);
    const dbMetrics = await prometheusService.getApmDatabase(app.id);
    sendSuccess(res, dbMetrics);
  } catch (error) {
    next(error);
  }
};

export const getApplicationApmDependencies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    const app = await applicationsService.getById(req.user!.id, req.params.id);
    const dependencies = await prometheusService.getApmDependencies(app.id);
    sendSuccess(res, { applicationId: app.id, dependencies });
  } catch (error) {
    next(error);
  }
};

export const getApplicationApmHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'applicationId');
    const app = await applicationsService.getById(req.user!.id, req.params.id);

    const now = Math.floor(Date.now() / 1000);
    const start = req.query.start ? Number(req.query.start) : now - 3600; // default last 1 hour
    const end = req.query.end ? Number(req.query.end) : now;
    const step = (req.query.step as string) || '60s';

    if (isNaN(start) || isNaN(end) || start >= end) {
      throw new AppError('INVALID_QUERY_RANGE', 'Start time must be strictly before end time', 400);
    }

    if (end - start > 30 * 24 * 3600) {
      throw new AppError('INVALID_QUERY_RANGE', 'Query range exceeds maximum of 30 days', 400);
    }

    if (!/^\d+[smhd]$/.test(step)) {
      throw new AppError('INVALID_STEP', 'Step must be a valid duration (e.g. 15s, 60s, 5m, 1h)', 400);
    }

    const history = await prometheusService.getApmHistory(app.id, { start, end, step });
    sendSuccess(res, history);
  } catch (error) {
    next(error);
  }
};
