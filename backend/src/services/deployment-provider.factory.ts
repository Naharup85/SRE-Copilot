import { env } from '../config/env';
import type { DeploymentProvider } from './deployment-provider.interface';
import { MockDeploymentProvider } from './mock-deployment.provider';
import { KubernetesDeploymentProvider } from './kubernetes-deployment.provider';
import { logger } from '../config/logger';

/**
 * Factory that selects the correct deployment provider based on env configuration.
 * Swap DEPLOYMENT_PROVIDER=kubernetes in production to use the real provider.
 */
export function createDeploymentProvider(): DeploymentProvider {
  if (env.DEPLOYMENT_PROVIDER === 'kubernetes') {
    logger.info('Using KubernetesDeploymentProvider');
    return new KubernetesDeploymentProvider();
  }

  logger.info('Using MockDeploymentProvider (set DEPLOYMENT_PROVIDER=kubernetes for real deployments)');
  return new MockDeploymentProvider();
}

// Singleton instance
export const deploymentProvider = createDeploymentProvider();
