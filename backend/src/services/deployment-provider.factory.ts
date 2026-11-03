import type { DeploymentProvider } from './deployment-provider.interface';
import { resolveDeploymentProvider } from './deployment-provider.resolver';

/**
 * Legacy factory kept for backwards compatibility.
 * Prefer using resolveDeploymentProvider(environment) for dynamic per-environment resolution.
 */
export function createDeploymentProvider(): DeploymentProvider {
  return resolveDeploymentProvider();
}

// Default singleton instance
export const deploymentProvider = createDeploymentProvider();
