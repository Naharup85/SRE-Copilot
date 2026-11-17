import { Request, Response, NextFunction } from 'express';
import { prometheusService } from '../../services/prometheus.service';
import { sendSuccess } from '../../utils/response';

export const getPrometheusHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const health = await prometheusService.checkHealth();
    sendSuccess(res, health);
  } catch (error) {
    next(error);
  }
};
