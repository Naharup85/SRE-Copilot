import { z } from 'zod';
import { AppError } from './errors';

export function validate<Output, Def extends z.ZodTypeDef = z.ZodTypeDef, Input = unknown>(
  schema: z.ZodType<Output, Def, Input>,
  data: unknown,
): Output {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    const message = firstError
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    throw new AppError('VALIDATION_ERROR', message, 400);
  }
  return result.data;
}

export function validateUuid(id?: unknown, fieldName = 'id'): asserts id is string {
  if (typeof id !== 'string') {
    throw new AppError('INVALID_UUID', `${fieldName} is required and must be a valid UUID`, 400);
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new AppError('INVALID_UUID', `Invalid ${fieldName}: must be a valid UUID`, 400);
  }
}

export function validateCommitSha(sha: string): void {
  const shaRegex = /^[0-9a-f]{7,40}$/i;
  if (!shaRegex.test(sha)) {
    throw new AppError(
      'INVALID_COMMIT_SHA',
      'Invalid commit SHA: must be 7-40 hex characters',
      400,
    );
  }
}
