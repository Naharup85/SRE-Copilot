import { Request, Response, NextFunction } from 'express';
import { deploymentsService } from './deployments.service';
import { createDeploymentSchema } from './deployments.types';
import { validate, validateUuid } from '../../utils/validate';
import { sendSuccess } from '../../utils/response';

export const createDeployment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { environmentId } = req.params;
    validateUuid(environmentId, 'environmentId');
    const input = validate(createDeploymentSchema, req.body);
    const deployment = await deploymentsService.create(req.user!.id, environmentId, input);
    sendSuccess(res, deployment, 201);
  } catch (error) {
    next(error);
  }
};

export const listDeployments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { environmentId } = req.params;
    validateUuid(environmentId, 'environmentId');
    const deps = await deploymentsService.listByEnvironment(req.user!.id, environmentId);
    sendSuccess(res, deps);
  } catch (error) {
    next(error);
  }
};

export const listAllDeployments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deps = await deploymentsService.listAll(req.user!.id);
    sendSuccess(res, deps);
  } catch (error) {
    next(error);
  }
};

export const getDeployment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'deploymentId');
    const deployment = await deploymentsService.getById(req.user!.id, req.params.id);
    sendSuccess(res, deployment);
  } catch (error) {
    next(error);
  }
};

export const getDeploymentLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    validateUuid(req.params.id, 'deploymentId');
    const logs = await deploymentsService.getLogs(req.user!.id, req.params.id);
    sendSuccess(res, logs);
  } catch (error) {
    next(error);
  }
};

export const getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await deploymentsService.getDashboardStats(req.user!.id);
    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
};
