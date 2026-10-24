import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';

export function validate(schema: any) {
      return async (req:Request, _:Response, next:NextFunction) => {
        try {
          const validatedData = await schema.parseAsync(req.body);
          req.body = validatedData;
          next();
        } catch (error:any) {
          const validationError = error.errors?.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })) || [{ field: 'unknown', message: 'Invalid data' }];
          logger.error({
            requestId: req.requestId,
            error: validationError[0].message,
          });
          next(new AppError('VALIDATION_ERROR', validationError[0].message, 400));
        }
      }
}