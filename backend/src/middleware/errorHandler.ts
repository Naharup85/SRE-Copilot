import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';
import { sendError } from '../utils/response';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error({
    requestId: req.requestId,
    userId: req.user?.id,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });

  if (error instanceof AppError) {
    sendError(res, error.code, error.message, error.statusCode);
    return;
  }

  // Handle Zod validation errors (already converted by validate utility)
  sendError(res, 'INTERNAL_SERVER_ERROR', 'An internal server error occurred', 500);
};
