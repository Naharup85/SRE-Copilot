import { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: SuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
): void {
  const body: ErrorResponse = { success: false, error: { code, message } };
  res.status(statusCode).json(body);
}
