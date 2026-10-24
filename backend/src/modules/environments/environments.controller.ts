import { Request, Response, NextFunction } from 'express';
import { environmentsService } from './environments.service';
import {  validateUuid } from '../../utils/validate';
import { sendSuccess ,sendCreated} from '../../utils/response';

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
    const input = req.body
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
