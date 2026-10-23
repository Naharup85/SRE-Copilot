import { z } from 'zod';

export const createApplicationSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens only')
    .trim(),
  description: z.string().max(1000, 'Description too long').optional(),
  repositoryUrl: z
    .string()
    .url('Invalid repository URL')
    .max(2048, 'URL too long'),
  repositoryOwner: z
    .string()
    .min(1, 'Repository owner is required')
    .max(255, 'Owner too long')
    .trim(),
  repositoryName: z
    .string()
    .min(1, 'Repository name is required')
    .max(255, 'Repository name too long')
    .trim(),
  defaultBranch: z
    .string()
    .min(1, 'Default branch is required')
    .max(255, 'Branch name too long')
    .trim()
    .default('main'),
});

export const updateApplicationSchema = createApplicationSchema.partial();

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
