import { Request, Response, NextFunction } from 'express';
import { applicationsService } from './applications.service';
import { validateUuid } from '../../utils/validate';
import { sendCreated, sendSuccess } from '../../utils/response';

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
