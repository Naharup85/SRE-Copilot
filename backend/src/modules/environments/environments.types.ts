import { z } from 'zod';

export const portBindingSchema = z.object({
  hostPort: z.number().int().min(1).max(65535),
  containerPort: z.number().int().min(1).max(65535),
});

export const healthCheckSchema = z.object({
  path: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  test: z.array(z.string()).optional(),
  intervalSeconds: z.number().int().min(1).default(5).optional(),
  timeoutSeconds: z.number().int().min(1).default(3).optional(),
  retries: z.number().int().min(1).default(3).optional(),
});

export const dockerTargetConfigSchema = z.object({
  containerName: z.string().max(255).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
  network: z.string().max(255).default('bridge').optional(),
  portBindings: z.array(portBindingSchema).default([]).optional(),
  secretRefs: z.record(z.string()).default({}).optional(),
  envVars: z.record(z.string()).default({}).optional(),
  healthCheck: healthCheckSchema.optional(),
});

export const kubernetesTargetConfigSchema = z.object({
  clusterName: z.string().max(255).default('default').optional(),
  namespace: z.string().max(255).regex(/^[a-z0-9-]+$/).default('default').optional(),
  deploymentName: z.string().max(255).regex(/^[a-z0-9-]+$/).optional(),
  containerName: z.string().max(255).optional(),
});

export const createEnvironmentSchema = z.object({
  name: z
    .string()
    .min(1, 'Environment name is required')
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens')
    .trim(),
  sreProfile: z.enum(['basic', 'standard']).default('basic').optional(),
  provider: z.enum(['docker', 'kubernetes']).default('kubernetes').optional(),
  targetConfig: z.record(z.any()).optional(),
  // Top-level legacy fields for convenience & backwards compatibility
  clusterName: z.string().max(255).optional().nullable(),
  namespace: z
    .string()
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Namespace must be valid Kubernetes identifier')
    .optional()
    .nullable(),
  deploymentName: z
    .string()
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Deployment name must be valid Kubernetes identifier')
    .optional()
    .nullable(),
  containerName: z.string().max(255).optional().nullable(),
});

export const updateEnvironmentSchema = createEnvironmentSchema.partial();

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
