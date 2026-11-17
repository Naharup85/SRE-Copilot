import { Request, Response, NextFunction } from 'express';
import type { CookieOptions } from 'express';
import { authService } from './auth.service';
import { sendCreated, sendSuccess } from '../../utils/response';


const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict'
}

const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = req.body;
    const { accessToken, refreshToken, user } = await authService.register(input);
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
    sendCreated(res, { ...user, token: accessToken });
  } catch (error) {
    next(error);
  }
};

const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = req.body;
    const { accessToken, refreshToken, user } = await authService.login(input);
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
    sendSuccess(res, { user, token: accessToken });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.id);
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

export {
  register,
  login,
  getMe
}
