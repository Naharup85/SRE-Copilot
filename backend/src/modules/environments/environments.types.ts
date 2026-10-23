import { z } from 'zod';

export const createEnvironmentSchema = z.object({
  name: z
    .string()
    .min(1, 'Environment name is required')
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens')
    .trim(),
  clusterName: z
    .string()
    .min(1, 'Cluster name is required')
    .max(255)
    .trim(),
  namespace: z
    .string()
    .min(1, 'Namespace is required')
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Namespace must be valid Kubernetes identifier')
    .trim(),
  deploymentName: z
    .string()
    .min(1, 'Deployment name is required')
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Deployment name must be valid Kubernetes identifier')
    .trim(),
  containerName: z
    .string()
    .min(1, 'Container name is required')
    .max(255)
    .trim(),
});

export const updateEnvironmentSchema = createEnvironmentSchema.partial();

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
