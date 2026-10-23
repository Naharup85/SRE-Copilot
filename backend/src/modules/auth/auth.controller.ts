import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { registerSchema, loginSchema } from './auth.types';
import { validate } from '../../utils/validate';
import { sendSuccess } from '../../utils/response';

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = validate(registerSchema, req.body);
    const result = await authService.register(input);
    sendSuccess(res, result, 201);
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = validate(loginSchema, req.body);
    const result = await authService.login(input);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.id);
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};
