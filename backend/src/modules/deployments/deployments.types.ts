import { z } from 'zod';

export const createDeploymentSchema = z.object({
  version: z
    .string()
    .min(1, 'Version is required')
    .max(255, 'Version too long')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Version contains invalid characters')
    .trim(),
  commitSha: z
    .string()
    .min(7, 'Commit SHA too short')
    .max(40, 'Commit SHA too long')
    .regex(/^[0-9a-f]+$/i, 'Commit SHA must be hexadecimal')
    .trim(),
});

export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;
